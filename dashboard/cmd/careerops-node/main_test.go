package main

import (
	"path/filepath"
	"reflect"
	"testing"
)

func TestRuntimePathUsesPackagedResourceLayout(t *testing.T) {
	tests := []struct {
		goos       string
		executable string
		want       string
	}{
		{"darwin", "/Applications/CareerOps.app/Contents/MacOS/careerops-node", "/Applications/CareerOps.app/Contents/Resources/runtime/careerops-node-runtime"},
		{"windows", "C:/Program Files/CareerOps/careerops-node.exe", "C:/Program Files/CareerOps/runtime/careerops-node-runtime.exe"},
	}
	for _, test := range tests {
		got, err := packagedRuntimePath(test.executable, test.goos)
		if err != nil {
			t.Fatalf("%s: %v", test.goos, err)
		}
		if filepath.Clean(got) != filepath.Clean(test.want) {
			t.Errorf("%s: got %q, want %q", test.goos, got, test.want)
		}
	}
}

func TestRuntimeArgsAlwaysStartJitless(t *testing.T) {
	want := []string{"--jitless", "intake.mjs", "--text", "cv/resume.md"}
	if got := runtimeArgs([]string{"intake.mjs", "--text", "cv/resume.md"}); !reflect.DeepEqual(got, want) {
		t.Fatalf("got %#v, want %#v", got, want)
	}
}

func TestRuntimeArgsRemovesJitlessOverrides(t *testing.T) {
	want := []string{"--jitless", "intake.mjs"}
	got := runtimeArgs([]string{
		"--no-jitless",
		"--no_jitless",
		"--no-jitless=true",
		"--no_jitless=true",
		"--nojitless",
		"-nojitless",
		"--jitless",
		"--jitless=false",
		"--jitless=0",
		"intake.mjs",
	})
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %#v, want %#v", got, want)
	}
}

func TestRuntimeEnvironmentPinsNodeOptions(t *testing.T) {
	got := runtimeEnvironment([]string{
		"PATH=/bin",
		"NODE_OPTIONS=--nojitless",
		"node_options=--jitless=false",
		"CAREEROPS_RESOURCE_DIR=/tmp/attacker-runtime",
	})
	want := []string{"PATH=/bin", "NODE_OPTIONS=--jitless"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %#v, want %#v", got, want)
	}
}
