package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRunReportReadsMarkdownAndSummary(t *testing.T) {
	res, err := runReport("testdata/career-ops", "reports/001-offerpad-2026-07-01.md")
	if err != nil {
		t.Fatalf("runReport: %v", err)
	}
	// "A) Role Summary" is the heading real reports use, and the fixture was
	// rewritten to match them in Task 2. An earlier revision of this plan
	// asserted "Block A — Role Summary", which no report or fixture contains.
	if !strings.Contains(res.Markdown, "A) Role Summary") {
		t.Errorf("Markdown does not contain the report body")
	}
	if res.Archetype != "Platform / Infra" {
		t.Errorf("Archetype = %q, want %q", res.Archetype, "Platform / Infra")
	}
	if res.Remote != "Remote (EU)" {
		t.Errorf("Remote = %q, want %q", res.Remote, "Remote (EU)")
	}
}

func TestRunReportRejectsEscapingPath(t *testing.T) {
	for _, rel := range []string{
		"../../../etc/passwd",
		"reports/../../go.mod",
		"/etc/passwd",
	} {
		if _, err := runReport("testdata/career-ops", rel); !errors.Is(err, errPathEscape) {
			t.Errorf("runReport(%q) error = %v, want errPathEscape", rel, err)
		}
	}
}

func TestRunReportMissingFile(t *testing.T) {
	if _, err := runReport("testdata/career-ops", "reports/999-nope.md"); err == nil {
		t.Error("runReport for a missing file returned nil error")
	} else if errors.Is(err, errPathEscape) {
		t.Error("a missing file was reported as a path escape")
	}
}

// TestSafeJoinSymlinkEscape covers the case EvalSymlinks cannot: it fails
// all-or-nothing on a missing path, so a symlinked directory pointing outside
// root, asked for a leaf that does not exist, would fall back to the
// unresolved lexical path and slip through a prefix check.
func TestSafeJoinSymlinkEscape(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()

	if err := os.WriteFile(filepath.Join(outside, "secret.txt"), []byte("no"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(root, "escape")); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}

	for _, rel := range []string{
		"escape/secret.txt",        // target exists — EvalSymlinks resolves it
		"escape/does-not-exist.md", // target missing — the case that regressed
	} {
		got, err := safeJoin(root, rel)
		if !errors.Is(err, errPathEscape) {
			t.Errorf("safeJoin(%q) = %q, err %v; want errPathEscape", rel, got, err)
		}
	}
}

// resolvedRoot is what safeJoin's return value can be compared against.
//
// safeJoin resolves symlinks on the root before building its result, so its
// return value is always a fully resolved path. On macOS t.TempDir() hands
// back something under /var/folders/…, and /var is a symlink to private/var —
// so the raw TempDir path never prefix-matches safeJoin's output. Comparing
// against the unresolved path fails on every macOS machine while the code is
// perfectly correct.
func resolvedRoot(t *testing.T, root string) string {
	t.Helper()
	resolved, err := filepath.EvalSymlinks(root)
	if err != nil {
		t.Fatalf("EvalSymlinks(%q): %v", root, err)
	}
	return resolved
}

// A missing file that genuinely lives inside root must stay a missing file,
// not become an escape. This is the regression the symlink fix could cause.
func TestSafeJoinAllowsMissingFileInsideRoot(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "reports"), 0o755); err != nil {
		t.Fatal(err)
	}

	got, err := safeJoin(root, "reports/999-nope.md")
	if err != nil {
		t.Fatalf("safeJoin for a missing file inside root: %v", err)
	}
	want := resolvedRoot(t, root)
	if !strings.HasPrefix(got, want+string(filepath.Separator)) {
		t.Errorf("safeJoin = %q, want a path under %q", got, want)
	}
}

// A missing file in a directory that does not exist either must also stay
// inside root — resolveNearest has to walk up more than one level here.
func TestSafeJoinAllowsMissingDirInsideRoot(t *testing.T) {
	root := t.TempDir()

	got, err := safeJoin(root, "no/such/dir/report.md")
	if err != nil {
		t.Fatalf("safeJoin for a missing nested path inside root: %v", err)
	}
	want := resolvedRoot(t, root)
	if !strings.HasPrefix(got, want+string(filepath.Separator)) {
		t.Errorf("safeJoin = %q, want a path under %q", got, want)
	}
}
