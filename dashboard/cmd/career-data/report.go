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

	target := filepath.Join(absRoot, filepath.FromSlash(rel))
	if resolved, err := filepath.EvalSymlinks(target); err == nil {
		target = resolved
	}

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
