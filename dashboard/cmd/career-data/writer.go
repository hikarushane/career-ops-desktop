package main

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

var (
	errRowNotFound   = errors.New("row not found")
	errInvalidStatus = errors.New("invalid status")
)

// canonicalStatuses is the allowed set, from templates/states.yml. Anything
// else is refused before the file is opened.
var canonicalStatuses = []string{
	"Evaluated", "Applied", "Responded", "Interview", "Offer", "Rejected", "Discarded", "SKIP",
}

// staleError means the row's status on disk is not what the caller expected,
// so the file changed outside the app and the write is refused.
type staleError struct {
	Actual string
}

func (e *staleError) Error() string {
	return fmt.Sprintf("row status is %q on disk", e.Actual)
}

// SetStatusResult is the success payload for set-status.
type SetStatusResult struct {
	OK           bool   `json:"ok"`
	ReportNumber string `json:"reportNumber"`
	OldStatus    string `json:"oldStatus"`
	NewStatus    string `json:"newStatus"`
	Backup       string `json:"backup"`
}

func isCanonical(s string) bool {
	for _, c := range canonicalStatuses {
		if c == s {
			return true
		}
	}
	return false
}

// rowHasReportNumber checks cell 7 (the report link) rather than the whole
// line, so a notes cell mentioning "[002]" cannot match the wrong row.
func rowHasReportNumber(raw, number string) bool {
	spans := cellSpans(raw)
	const reportCellIndex = 7
	if len(spans) <= reportCellIndex {
		return false
	}
	s, e := trimSpan(raw, spans[reportCellIndex])
	return strings.HasPrefix(raw[s:e], "["+number+"]")
}

// setStatus rewrites one row's status cell under four protections: an
// optimistic lock, a single-cell splice, a backup, and an atomic rename.
func setStatus(root, reportNumber, expect, next string) (SetStatusResult, error) {
	if !isCanonical(next) {
		return SetStatusResult{}, fmt.Errorf("%w: %q", errInvalidStatus, next)
	}

	tracker, ok := resolveTracker(root)
	if !ok {
		return SetStatusResult{}, errNoTracker
	}

	original, err := os.ReadFile(tracker)
	if err != nil {
		return SetStatusResult{}, err
	}

	// Splitting on "\n" leaves any "\r" attached to the end of each line, so
	// joining with "\n" reproduces the original bytes. CRLF survives without
	// any terminator detection.
	lines := strings.Split(string(original), "\n")

	target := -1
	for i, raw := range lines {
		if rowHasReportNumber(raw, reportNumber) {
			target = i
			break
		}
	}
	if target < 0 {
		return SetStatusResult{}, fmt.Errorf("%w: report %s", errRowNotFound, reportNumber)
	}

	start, end, ok := statusSpan(lines[target])
	if !ok {
		return SetStatusResult{}, fmt.Errorf("%w: report %s has no status cell", errRowNotFound, reportNumber)
	}

	actual := lines[target][start:end]
	if actual != expect {
		return SetStatusResult{}, &staleError{Actual: actual}
	}

	backupRel, err := writeBackup(root, tracker, original)
	if err != nil {
		return SetStatusResult{}, err
	}

	updated, _ := spliceStatus(lines[target], next)
	lines[target] = updated

	if err := atomicWrite(tracker, []byte(strings.Join(lines, "\n"))); err != nil {
		return SetStatusResult{}, err
	}

	return SetStatusResult{
		OK:           true,
		ReportNumber: reportNumber,
		OldStatus:    actual,
		NewStatus:    next,
		Backup:       backupRel,
	}, nil
}

// writeBackup copies the pre-write bytes next to the tracker and returns the
// backup's path relative to root. One level, overwritten each time.
func writeBackup(root, tracker string, content []byte) (string, error) {
	backup := filepath.Join(filepath.Dir(tracker), ".applications.md.bak")
	if err := os.WriteFile(backup, content, 0o644); err != nil {
		return "", err
	}
	rel, err := filepath.Rel(root, backup)
	if err != nil {
		return backup, nil
	}
	return filepath.ToSlash(rel), nil
}

// atomicWrite writes to a temp file in the target's directory and renames over
// it, so a crash mid-write leaves the original intact.
func atomicWrite(path string, content []byte) error {
	dir := filepath.Dir(path)

	mode := os.FileMode(0o644)
	if st, err := os.Stat(path); err == nil {
		mode = st.Mode().Perm()
	}

	tmp, err := os.CreateTemp(dir, ".applications.md.tmp-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName) // no-op once the rename succeeds

	if _, err := io.Copy(tmp, strings.NewReader(string(content))); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmpName, mode); err != nil {
		return err
	}
	return os.Rename(tmpName, path)
}
