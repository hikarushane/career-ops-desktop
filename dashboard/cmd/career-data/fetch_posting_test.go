package main

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

var linkedinGuestHTML = `<html><body>
<h2 class="top-card-layout__title font-sans topcard__title">Technischer Projektkoordinator (m/w/x)</h2>
<a class="topcard__org-name-link">Beispiel GmbH</a>
<span class="topcard__flavor topcard__flavor--bullet">Hamburg, Germany</span>
<div class="show-more-less-html__markup"><p>Wir suchen einen Koordinator.</p><ul><li>Planung</li><li>Steuerung</li></ul>` + strings.Repeat("<p>Mehr Text.</p>", 40) + `</div>
</body></html>`

func TestFetchPostingLinkedInUsesGuestEndpoint(t *testing.T) {
	var hit string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hit = r.URL.Path
		_, _ = w.Write([]byte(linkedinGuestHTML))
	}))
	defer srv.Close()
	linkedinGuestBase = srv.URL // test hook
	t.Cleanup(func() { linkedinGuestBase = "https://www.linkedin.com" })
	got, err := fetchPosting("https://www.linkedin.com/jobs/view/technischer-projektkoordinator-4459290748?trk=x", srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	if hit != "/jobs-guest/jobs/api/jobPosting/4459290748" {
		t.Fatalf("hit %q", hit)
	}
	if got.Source != "linkedin-guest" || got.Title != "Technischer Projektkoordinator (m/w/x)" || got.Company != "Beispiel GmbH" {
		t.Fatalf("got %+v", got)
	}
	if !strings.Contains(got.Text, "Planung") {
		t.Fatalf("text missing description: %q", got.Text)
	}
}

func TestFetchPostingGenericHTMLExtractsMain(t *testing.T) {
	body := `<html><head><title>Project Coordinator - StepStone</title></head><body><nav>menu</nav><main><h1>Project Coordinator</h1>` + strings.Repeat("<p>Responsibilities and requirements text.</p>", 30) + `</main><footer>f</footer></body></html>`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(body)) }))
	defer srv.Close()
	got, err := fetchPosting(srv.URL+"/jobs/1", srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	if got.Source != "html" || got.Title != "Project Coordinator - StepStone" {
		t.Fatalf("got %+v", got)
	}
	if strings.Contains(got.Text, "menu") {
		t.Fatal("nav should be stripped")
	}
}

func TestFetchPostingReportsBotWallsAsBlocked(t *testing.T) {
	for _, status := range []int{401, 403} {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(status) }))
		_, err := fetchPosting(srv.URL, srv.Client())
		srv.Close()
		var fe *fetchError
		if !errors.As(err, &fe) || fe.code != "blocked" || !strings.Contains(fe.message, "blocks automatic reading") {
			t.Fatalf("status %d: want blocked with explanation, got %v", status, err)
		}
	}
}

func TestFetchPostingBlockedOnShortOrLoginWall(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(`<html><body><main>Sign in to continue</main></body></html>`)) }))
	defer srv.Close()
	_, err := fetchPosting(srv.URL, srv.Client())
	var fe *fetchError
	if !errors.As(err, &fe) || fe.code != "blocked" {
		t.Fatalf("want blocked, got %v", err)
	}
}

// TestFetchPostingCapsRedirects exercises the default client built inside
// fetchPosting (client == nil), which is where the redirect cap lives. The
// httptest server always redirects to itself, so a working cap is the only
// thing that stops this from hanging; without CheckRedirect, Go's built-in
// default of 10 redirects would also eventually stop it, but only after
// hitting the network 10 times instead of 5, and would report it as a
// generic "stopped after 10 redirects" error rather than the client's own
// too-many-redirects error at the boundary this test pins.
func TestFetchPostingCapsRedirects(t *testing.T) {
	var srv *httptest.Server
	srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, srv.URL, http.StatusFound)
	}))
	defer srv.Close()
	_, err := fetchPosting(srv.URL, nil)
	var fe *fetchError
	if !errors.As(err, &fe) || fe.code != "network" {
		t.Fatalf("want network error from redirect cap, got %v", err)
	}
}

// TestFetchPostingDecodesNonUTF8Charset pins the charset.NewReader transcode
// in `get`: a page served as ISO-8859-1 (common on older corporate ATS
// pages) must come out with its non-ASCII characters intact, not mojibake
// from html.Parse assuming UTF-8 on the raw bytes.
func TestFetchPostingDecodesNonUTF8Charset(t *testing.T) {
	// 'ä' (U+00E4) is byte 0xE4 in ISO-8859-1 / Latin-1.
	body := []byte("<html><head><title>B\xe4ckerei GmbH</title></head><body><main><p>Wir suchen eine erfahrene B\xe4ckerin oder einen B\xe4cker.</p>" +
		strings.Repeat("<p>Weitere Beschreibung des Stellenangebots.</p>", 20) + "</main></body></html>")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=iso-8859-1")
		_, _ = w.Write(body)
	}))
	defer srv.Close()
	got, err := fetchPosting(srv.URL, srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(got.Text, "ä") {
		t.Fatalf("expected decoded ISO-8859-1 text to contain %q, got %q", "ä", got.Text)
	}
}

// TestLinkedInJobIDExtraction pins linkedInJobID to the trailing job ID in
// a /jobs/view/... path or a currentJobId= query parameter, rejecting an
// earlier 6+ digit run (e.g. a requisition number or year) embedded before
// it in the slug.
// StepStone (and other boards that render the posting client-side) serve a
// static page whose first <article> is a ~250-character teaser card, while
// the full description lives only in the schema.org JobPosting JSON-LD.
func TestFetchPostingPrefersJSONLDJobPosting(t *testing.T) {
	desc := strings.Repeat(`<p>Responsibilities and requirements text.</p>\n`, 30)
	body := `<html><head><title>Projektkoordinator (m/w/d) - Job in Ispringen</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"JobPosting","title":"Projektkoordinator (m/w/d)",
"hiringOrganization":{"@type":"Organization","name":"PPM GmbH"},
"jobLocation":{"@type":"Place","address":{"@type":"PostalAddress","addressLocality":"Ispringen","addressCountry":"DE"}},
"description":"<h4>Einleitung</h4>` + desc + `"}</script></head>
<body><article><h2>Similar job</h2><p>teaser card</p></article><div id="app"></div></body></html>`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(body)) }))
	defer srv.Close()
	got, err := fetchPosting(srv.URL+"/stellenangebote--x.html", srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	if got.Source != "json-ld" || got.Title != "Projektkoordinator (m/w/d)" || got.Company != "PPM GmbH" || got.Location != "Ispringen" {
		t.Fatalf("got %+v", got)
	}
	if !strings.Contains(got.Text, "Einleitung") || !strings.Contains(got.Text, "Responsibilities") {
		t.Fatalf("description text missing: %q", got.Text[:120])
	}
	if strings.Contains(got.Text, "<p>") || strings.Contains(got.Text, "teaser card") {
		t.Fatalf("tags should be stripped and the teaser ignored: %q", got.Text[:120])
	}
}

func TestFetchPostingFindsJobPostingInsideGraph(t *testing.T) {
	desc := strings.Repeat(`<li>Requirement</li>`, 60)
	body := `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage","name":"x"},{"@type":["JobPosting","Thing"],"title":"Data Engineer","hiringOrganization":{"name":"Acme"},"jobLocation":[{"address":"Berlin, DE"}],"description":"<ul>` + desc + `</ul>"}]}</script></head><body></body></html>`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(body)) }))
	defer srv.Close()
	got, err := fetchPosting(srv.URL, srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	if got.Source != "json-ld" || got.Title != "Data Engineer" || got.Company != "Acme" || got.Location != "Berlin, DE" {
		t.Fatalf("got %+v", got)
	}
}

// A JSON-LD block that only carries a teaser must not win over a full <main>.
func TestFetchPostingFallsBackToHTMLWhenJSONLDIsShort(t *testing.T) {
	body := `<html><head><title>Role - Board</title><script type="application/ld+json">{"@type":"JobPosting","title":"Role","description":"Short teaser only."}</script></head><body><main><h1>Role</h1>` + strings.Repeat("<p>Full responsibilities and requirements text.</p>", 30) + `</main></body></html>`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(body)) }))
	defer srv.Close()
	got, err := fetchPosting(srv.URL, srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	if got.Source != "html" || !strings.Contains(got.Text, "Full responsibilities") {
		t.Fatalf("got %+v", got)
	}
}

// Without <main> or JSON-LD, the largest <article> is the posting, not the
// first one.
func TestFetchPostingPicksLargestArticle(t *testing.T) {
	body := `<html><head><title>Role</title></head><body><article><p>Related job teaser.</p></article><article><h1>Role</h1>` + strings.Repeat("<p>Main posting body text.</p>", 30) + `</article></body></html>`
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(body)) }))
	defer srv.Close()
	got, err := fetchPosting(srv.URL, srv.Client())
	if err != nil {
		t.Fatal(err)
	}
	if got.Source != "html" || !strings.Contains(got.Text, "Main posting body") || strings.Contains(got.Text, "Related job teaser") {
		t.Fatalf("got %+v", got)
	}
}

func TestLinkedInJobIDExtraction(t *testing.T) {
	cases := []struct {
		url  string
		want string
		ok   bool
	}{
		{"https://www.linkedin.com/jobs/view/data-analyst-2024001-at-acme-4459290748", "4459290748", true},
		{"https://www.linkedin.com/jobs/view/4459290748/", "4459290748", true},
		{"https://www.linkedin.com/jobs/view/4459290748?trk=x", "4459290748", true},
		{"https://www.linkedin.com/jobs/search/?currentJobId=4459290748&keywords=pm", "4459290748", true},
		{"https://www.linkedin.com/jobs/view/engineer-web3-2024-4459290748", "4459290748", true},
		{"https://www.linkedin.com/company/acme/", "", false},
	}
	for _, c := range cases {
		got, ok := linkedInJobID(c.url)
		if ok != c.ok || got != c.want {
			t.Errorf("linkedInJobID(%q) = (%q, %v), want (%q, %v)", c.url, got, ok, c.want, c.ok)
		}
	}
}
