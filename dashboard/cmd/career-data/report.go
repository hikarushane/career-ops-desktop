package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
)

// errPathEscape means the requested report resolves outside the career-ops
// root. The frontend passes paths straight from the tracker, but the tracker is
// user-editable text, so the check belongs here.
var errPathEscape = errors.New("path escapes root")

// ReportResult carries the full markdown plus the same summary fields list
// returns, so the preview card and the rendered body come from one round trip.
type ReportResult struct {
	OK        bool   `json:"ok"`
	Path      string `json:"path"`
	Markdown  string `json:"markdown"`
	Archetype string `json:"archetype"`
	TlDr      string `json:"tldr"`
	Remote    string `json:"remote"`
	Comp      string `json:"comp"`
}

// resolveNearest resolves symlinks on the deepest ancestor of p that exists,
// then re-appends the components that do not.
//
// filepath.EvalSymlinks fails all-or-nothing when any component is missing.
// Falling back to the unresolved lexical path on that error is unsafe: a
// symlinked directory inside root pointing outside it, asked for a leaf that
// does not exist, yields a path that still textually sits under root and
// passes a prefix check while resolving outside root at the OS level.
// Resolving the existing ancestor closes that hole while leaving ordinary
// missing files inside root reported as missing, not as escapes.
func resolveNearest(p string) (string, error) {
	var missing []string
	cur := p
	for {
		if resolved, err := filepath.EvalSymlinks(cur); err == nil {
			out := resolved
			for i := len(missing) - 1; i >= 0; i-- {
				out = filepath.Join(out, missing[i])
			}
			return out, nil
		}
		parent := filepath.Dir(cur)
		if parent == cur {
			return "", errPathEscape
		}
		missing = append(missing, filepath.Base(cur))
		cur = parent
	}
}

// safeJoin resolves rel under root and confirms the result stays inside it,
// after symlinks are followed on whichever ancestors already exist.
func safeJoin(root, rel string) (string, error) {
	if filepath.IsAbs(rel) {
		return "", errPathEscape
	}
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	if resolved, err := filepath.EvalSymlinks(absRoot); err == nil {
		absRoot = resolved
	}

	target, err := resolveNearest(filepath.Join(absRoot, filepath.FromSlash(rel)))
	if err != nil {
		return "", err
	}

	// absRoot+Separator, not a bare prefix — otherwise /rootsuffix passes as
	// being inside /root.
	if target != absRoot && !strings.HasPrefix(target, absRoot+string(filepath.Separator)) {
		return "", errPathEscape
	}
	return target, nil
}

func runReport(root, rel string) (ReportResult, error) {
	full, err := safeJoin(root, rel)
	if err != nil {
		return ReportResult{}, err
	}

	content, err := os.ReadFile(full)
	if err != nil {
		return ReportResult{}, err
	}

	res := ReportResult{OK: true, Path: rel, Markdown: string(content)}
	res.Archetype, res.TlDr, res.Remote, res.Comp = extractSummary(res.Markdown)
	return res, nil
}
