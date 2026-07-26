package main

import (
	"os"
	"path/filepath"
)

// onboardingFiles are the files career-ops needs before any evaluation can run.
// Order is display order in the empty state, so it is fixed, not alphabetical.
var onboardingFiles = []string{
	"cv.md",
	"config/profile.yml",
	"modes/_profile.md",
	"portals.yml",
	"data/applications.md",
}

// DoctorResult reports which onboarding files are missing under root.
type DoctorResult struct {
	OK            bool     `json:"ok"`
	CareerOpsPath string   `json:"careerOpsPath"`
	TrackerPath   *string  `json:"trackerPath"`
	Missing       []string `json:"missing"`
	Ready         bool     `json:"ready"`
}

// resolveTracker mirrors ParseApplications: the tracker sits at the root, or
// else under data/.
func resolveTracker(root string) (string, bool) {
	for _, rel := range []string{"applications.md", filepath.Join("data", "applications.md")} {
		p := filepath.Join(root, rel)
		if st, err := os.Stat(p); err == nil && !st.IsDir() {
			return p, true
		}
	}
	return "", false
}

func runDoctor(root string) DoctorResult {
	res := DoctorResult{OK: true, CareerOpsPath: root, Missing: []string{}}

	tracker, hasTracker := resolveTracker(root)
	if hasTracker {
		res.TrackerPath = &tracker
		res.Ready = true
	}

	for _, rel := range onboardingFiles {
		if rel == "data/applications.md" {
			if !hasTracker {
				res.Missing = append(res.Missing, rel)
			}
			continue
		}
		if _, err := os.Stat(filepath.Join(root, filepath.FromSlash(rel))); err != nil {
			res.Missing = append(res.Missing, rel)
		}
	}

	return res
}
