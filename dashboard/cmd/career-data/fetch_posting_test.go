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

func TestFetchPostingBlockedOnShortOrLoginWall(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte(`<html><body><main>Sign in to continue</main></body></html>`)) }))
	defer srv.Close()
	_, err := fetchPosting(srv.URL, srv.Client())
	var fe *fetchError
	if !errors.As(err, &fe) || fe.code != "blocked" {
		t.Fatalf("want blocked, got %v", err)
	}
}
