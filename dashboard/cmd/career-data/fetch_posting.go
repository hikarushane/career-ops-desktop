// fetch-posting downloads a job posting over plain HTTP and extracts its
// text, so the desktop app can capture the JD before spending AI tokens on
// it. LinkedIn's public job pages redirect to a login wall for guests, so
// LinkedIn URLs go through the unauthenticated jobs-guest API instead; every
// other host is scraped as generic HTML.
package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"golang.org/x/net/html"
)

// FetchPostingResult is the JSON shape returned by `fetch-posting --url`.
type FetchPostingResult struct {
	OK        bool   `json:"ok"`
	Source    string `json:"source"`
	Title     string `json:"title"`
	Company   string `json:"company"`
	Location  string `json:"location"`
	Text      string `json:"text"`
	FetchedAt string `json:"fetchedAt"`
}

// fetchError carries a machine-readable code alongside the human message, so
// main.go's dispatch can map it straight onto fail(code, message).
type fetchError struct{ code, message string }

func (e *fetchError) Error() string { return e.code + ": " + e.message }

// linkedinGuestBase is a test hook: production code never overrides it.
var linkedinGuestBase = "https://www.linkedin.com"

var linkedinIDRe = regexp.MustCompile(`(?:/jobs/view/[^/?#]*?-?|currentJobId=)(\d{6,})`)
var loginWallRe = regexp.MustCompile(`(?i)\b(sign in to continue|authwall|log in to view|login required|join now to see)\b`)

const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
const minPostingChars = 400

// fetchPosting downloads url and extracts a title/company/location/text
// tuple. client may be nil, in which case a default 15s-timeout client is
// used; tests pass an httptest server's client so no real network call is
// made.
func fetchPosting(raw string, client *http.Client) (FetchPostingResult, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return FetchPostingResult{}, &fetchError{"usage", "not an http(s) URL"}
	}
	if client == nil {
		client = &http.Client{Timeout: 15 * time.Second}
	}
	if strings.Contains(u.Host, "linkedin.com") {
		if m := linkedinIDRe.FindStringSubmatch(u.String()); m != nil {
			return fetchLinkedInGuest(m[1], client)
		}
	}
	doc, err := get(u.String(), client)
	if err != nil {
		return FetchPostingResult{}, err
	}
	title := normalize(textOf(first(doc, "title")))
	body := first(doc, "main")
	if body == nil {
		body = first(doc, "article")
	}
	if body == nil {
		body = first(doc, "body")
	}
	stripNoise(body)
	text := normalize(textOf(body))
	if err := checkText(text); err != nil {
		return FetchPostingResult{}, err
	}
	return FetchPostingResult{OK: true, Source: "html", Title: title, Text: text, FetchedAt: now()}, nil
}

// fetchLinkedInGuest reads a posting from LinkedIn's unauthenticated
// jobs-guest API, which serves the full description without a login wall.
func fetchLinkedInGuest(id string, client *http.Client) (FetchPostingResult, error) {
	doc, err := get(linkedinGuestBase+"/jobs-guest/jobs/api/jobPosting/"+id, client)
	if err != nil {
		return FetchPostingResult{}, err
	}
	title := normalize(textOf(firstClass(doc, "topcard__title")))
	company := normalize(textOf(firstClass(doc, "topcard__org-name-link")))
	location := normalize(textOf(firstClass(doc, "topcard__flavor--bullet")))
	text := normalize(textOf(firstClass(doc, "show-more-less-html__markup")))
	if err := checkText(text); err != nil {
		return FetchPostingResult{}, err
	}
	full := strings.TrimSpace(strings.Join([]string{title, company, location, "", text}, "\n"))
	return FetchPostingResult{OK: true, Source: "linkedin-guest", Title: title, Company: company, Location: location, Text: full, FetchedAt: now()}, nil
}

// now returns the current UTC time, RFC3339-formatted, as FetchedAt.
func now() string { return time.Now().UTC().Format(time.RFC3339) }

// get performs the actual HTTP GET and parses the response body as HTML,
// translating transport and status-code failures into fetchError codes that
// main.go's dispatch already knows how to report.
func get(target string, client *http.Client) (*html.Node, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return nil, &fetchError{"network", err.Error()}
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept-Language", "en,de;q=0.8")
	resp, err := client.Do(req)
	if err != nil {
		return nil, &fetchError{"network", err.Error()}
	}
	defer resp.Body.Close()
	if resp.StatusCode == 429 || resp.StatusCode == 403 || resp.StatusCode == 999 {
		return nil, &fetchError{"blocked", fmt.Sprintf("HTTP %d", resp.StatusCode)}
	}
	if resp.StatusCode >= 400 {
		return nil, &fetchError{"network", fmt.Sprintf("HTTP %d", resp.StatusCode)}
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return nil, &fetchError{"network", err.Error()}
	}
	doc, err := html.Parse(strings.NewReader(string(body)))
	if err != nil {
		return nil, &fetchError{"empty", "page could not be parsed"}
	}
	return doc, nil
}

// checkText rejects text too short to be a real posting, or text that reads
// like a login wall rather than a job description.
func checkText(text string) error {
	if loginWallRe.MatchString(text) {
		return &fetchError{"blocked", "the page asks for a login"}
	}
	if len([]rune(text)) < minPostingChars {
		return &fetchError{"empty", "the page has too little text to be a job description"}
	}
	return nil
}

// --- html.Node helpers -----------------------------------------------------

// first returns the first element (depth-first, pre-order) with the given
// tag name, or nil if root is nil or none is found.
func first(root *html.Node, tag string) *html.Node {
	if root == nil {
		return nil
	}
	if root.Type == html.ElementNode && root.Data == tag {
		return root
	}
	for c := root.FirstChild; c != nil; c = c.NextSibling {
		if found := first(c, tag); found != nil {
			return found
		}
	}
	return nil
}

// hasClassToken reports whether n's class attribute contains class as a
// whitespace-separated token.
func hasClassToken(n *html.Node, class string) bool {
	for _, a := range n.Attr {
		if a.Key != "class" {
			continue
		}
		for _, tok := range strings.Fields(a.Val) {
			if tok == class {
				return true
			}
		}
	}
	return false
}

// firstClass returns the first element (depth-first, pre-order) whose class
// attribute contains the given token, or nil if root is nil or none matches.
func firstClass(root *html.Node, class string) *html.Node {
	if root == nil {
		return nil
	}
	if root.Type == html.ElementNode && hasClassToken(root, class) {
		return root
	}
	for c := root.FirstChild; c != nil; c = c.NextSibling {
		if found := firstClass(c, class); found != nil {
			return found
		}
	}
	return nil
}

// blockTags insert a newline after their text content, so paragraphs, list
// items and table rows don't run together once whitespace is collapsed.
var blockTags = map[string]bool{
	"p": true, "li": true, "br": true, "div": true, "tr": true,
	"h1": true, "h2": true, "h3": true, "h4": true, "h5": true, "h6": true,
}

// textOf concatenates n's text content depth-first, inserting "\n" after
// block-level elements so structure survives whitespace normalization.
func textOf(n *html.Node) string {
	if n == nil {
		return ""
	}
	var sb strings.Builder
	if n.Type == html.TextNode {
		sb.WriteString(n.Data)
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		sb.WriteString(textOf(c))
	}
	if n.Type == html.ElementNode && blockTags[n.Data] {
		sb.WriteString("\n")
	}
	return sb.String()
}

// noiseTags are subtrees that never contribute to a job posting's readable
// text: navigation chrome, scripts/styles, and inline vector art.
var noiseTags = map[string]bool{
	"script": true, "style": true, "nav": true, "header": true,
	"footer": true, "aside": true, "noscript": true, "svg": true,
}

// stripNoise removes noiseTags subtrees from n in place.
func stripNoise(n *html.Node) {
	if n == nil {
		return
	}
	c := n.FirstChild
	for c != nil {
		next := c.NextSibling
		if c.Type == html.ElementNode && noiseTags[c.Data] {
			n.RemoveChild(c)
		} else {
			stripNoise(c)
		}
		c = next
	}
}

var spaceRunRe = regexp.MustCompile(`[ \t]+`)
var newlineRunRe = regexp.MustCompile(`\n{3,}`)

// normalize collapses runs of spaces/tabs to a single space, collapses 3+
// consecutive newlines down to 2, and trims the result.
func normalize(s string) string {
	s = spaceRunRe.ReplaceAllString(s, " ")
	lines := strings.Split(s, "\n")
	for i, line := range lines {
		lines[i] = strings.TrimSpace(line)
	}
	s = strings.Join(lines, "\n")
	s = newlineRunRe.ReplaceAllString(s, "\n\n")
	return strings.TrimSpace(s)
}
