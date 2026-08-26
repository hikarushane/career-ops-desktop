package main

import "github.com/santifer/career-ops/dashboard/internal/data"

type StateEntry struct {
	ID       string `json:"id"`
	Label    string `json:"label"`
	Terminal bool   `json:"terminal"`
	Priority int    `json:"priority"`
	Group    string `json:"group"`
}

type ContractsResult struct {
	OK     bool         `json:"ok"`
	States []StateEntry `json:"states"`
}

func runContracts() ContractsResult {
	ordered := []struct {
		id       string
		label    string
		terminal bool
	}{
		{"evaluated", "Evaluated", false},
		{"applied", "Applied", false},
		{"responded", "Responded", false},
		{"interview", "Interview", false},
		{"offer", "Offer", true},
		{"hired", "Hired", true},
		{"rejected", "Rejected", true},
		{"discarded", "Discarded", true},
		{"skip", "SKIP", true},
	}

	states := make([]StateEntry, len(ordered))
	for i, s := range ordered {
		states[i] = StateEntry{
			ID:       s.id,
			Label:    s.label,
			Terminal: s.terminal,
			Priority: data.StatusPriority(s.id),
			Group:    s.id,
		}
	}
	return ContractsResult{OK: true, States: states}
}
