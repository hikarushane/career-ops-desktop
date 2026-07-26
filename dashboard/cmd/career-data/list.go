package main

import (
	"errors"
	"path/filepath"
	"strings"

	"github.com/santifer/career-ops/dashboard/internal/data"
	"github.com/santifer/career-ops/dashboard/internal/model"
)

// errNoTracker means applications.md exists at neither candidate location.
var errNoTracker = errors.New("tracker not found")

// Application is the wire form of model.CareerApplication plus a resolved PDF
// path. Field order matches the tracker's column order for readability.
type Application struct {
	Number       int     `json:"number"`
	Date         string  `json:"date"`
	Company      string  `json:"company"`
	Role         string  `json:"role"`
	Status       string  `json:"status"`
	NormStatus   string  `json:"normStatus"`
	StatusPrio   int     `json:"statusPriority"`
	Score        float64 `json:"score"`
	ScoreRaw     string  `json:"scoreRaw"`
	HasPDF       bool    `json:"hasPdf"`
	PDFPath      string  `json:"pdfPath"`
	ReportPath   string  `json:"reportPath"`
	ReportNumber string  `json:"reportNumber"`
	Notes        string  `json:"notes"`
	JobURL       string  `json:"jobUrl"`
	Archetype    string  `json:"archetype"`
	TlDr         string  `json:"tldr"`
	Remote       string  `json:"remote"`
	CompEstimate string  `json:"compEstimate"`
}

// ListResult is the full payload the frontend loads on startup and after every
// write.
type ListResult struct {
	OK           bool                  `json:"ok"`
	Applications []Application         `json:"applications"`
	Metrics      model.PipelineMetrics `json:"metrics"`
	Progress     model.ProgressMetrics `json:"progress"`
}

// slugify reduces a company name to a comparable token: lowercase, with every
// run of non-alphanumeric bytes collapsed to a single hyphen.
func slugify(s string) string {
	var b strings.Builder
	lastHyphen := true // suppresses a leading hyphen
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c >= 'A' && c <= 'Z':
			b.WriteByte(c + ('a' - 'A'))
			lastHyphen = false
		case (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9'):
			b.WriteByte(c)
			lastHyphen = false
		default:
			if !lastHyphen {
				b.WriteByte('-')
				lastHyphen = true
			}
		}
	}
	return strings.Trim(b.String(), "-")
}

// resolvePDF finds the generated CV for a company. generate-pdf.mjs takes its
// output path as a caller-supplied argument, so there is no naming convention
// to rely on: a unique slug match wins, anything else returns empty and the UI
// falls back to opening the output directory.
func resolvePDF(root, company string) string {
	slug := slugify(company)
	if slug == "" {
		return ""
	}
	matches, err := filepath.Glob(filepath.Join(root, "output", "*.pdf"))
	if err != nil {
		return ""
	}
	var hit string
	for _, m := range matches {
		if !strings.Contains(slugify(filepath.Base(m)), slug) {
			continue
		}
		if hit != "" {
			return "" // ambiguous
		}
		hit = m
	}
	if hit == "" {
		return ""
	}
	rel, err := filepath.Rel(root, hit)
	if err != nil {
		return ""
	}
	return filepath.ToSlash(rel)
}

func runList(root string) (ListResult, error) {
	apps := data.ParseApplications(root)
	if apps == nil {
		return ListResult{}, errNoTracker
	}

	out := ListResult{
		OK:           true,
		Applications: make([]Application, 0, len(apps)),
		Metrics:      data.ComputeMetrics(apps),
		Progress:     data.ComputeProgressMetrics(apps),
	}

	for _, a := range apps {
		item := Application{
			Number:       a.Number,
			Date:         a.Date,
			Company:      a.Company,
			Role:         a.Role,
			Status:       a.Status,
			NormStatus:   data.NormalizeStatus(a.Status),
			StatusPrio:   data.StatusPriority(a.Status),
			Score:        a.Score,
			ScoreRaw:     a.ScoreRaw,
			HasPDF:       a.HasPDF,
			ReportPath:   a.ReportPath,
			ReportNumber: a.ReportNumber,
			Notes:        a.Notes,
			JobURL:       a.JobURL,
		}
		if a.ReportPath != "" {
			item.Archetype, item.TlDr, item.Remote, item.CompEstimate =
				data.LoadReportSummary(root, a.ReportPath)
		}
		if a.HasPDF {
			item.PDFPath = resolvePDF(root, a.Company)
		}
		out.Applications = append(out.Applications, item)
	}

	return out, nil
}
