package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestRunDoctorEmptyRoot(t *testing.T) {
	root := t.TempDir()

	got := runDoctor(root)

	if got.Ready {
		t.Fatalf("Ready = true, want false for an empty root")
	}
	if got.TrackerPath != nil {
		t.Fatalf("TrackerPath = %v, want nil", *got.TrackerPath)
	}
	want := []string{"cv.md", "config/profile.yml", "modes/_profile.md", "portals.yml", "data/applications.md"}
	if len(got.Missing) != len(want) {
		t.Fatalf("Missing = %v, want %v", got.Missing, want)
	}
	for i, w := range want {
		if got.Missing[i] != w {
			t.Errorf("Missing[%d] = %q, want %q", i, got.Missing[i], w)
		}
	}
}

func TestRunDoctorFindsTrackerInDataDir(t *testing.T) {
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "data"), 0o755); err != nil {
		t.Fatal(err)
	}
	tracker := filepath.Join(root, "data", "applications.md")
	if err := os.WriteFile(tracker, []byte("# Applications Tracker\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	got := runDoctor(root)

	if !got.Ready {
		t.Fatalf("Ready = false, want true when the tracker exists")
	}
	if got.TrackerPath == nil || *got.TrackerPath != tracker {
		t.Fatalf("TrackerPath = %v, want %q", got.TrackerPath, tracker)
	}
	for _, m := range got.Missing {
		if m == "data/applications.md" {
			t.Errorf("Missing still lists data/applications.md")
		}
	}
}

func TestRunDoctorFindsTrackerAtRoot(t *testing.T) {
	root := t.TempDir()
	tracker := filepath.Join(root, "applications.md")
	if err := os.WriteFile(tracker, []byte("# Applications Tracker\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	got := runDoctor(root)

	if got.TrackerPath == nil || *got.TrackerPath != tracker {
		t.Fatalf("TrackerPath = %v, want %q", got.TrackerPath, tracker)
	}
}
