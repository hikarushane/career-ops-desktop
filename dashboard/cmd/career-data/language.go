package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

func managedNodePath(executable, goos string) string {
	name := "careerops-node"
	if goos == "windows" {
		name += ".exe"
	}
	return filepath.Join(filepath.Dir(executable), name)
}

func managedScriptRoot(executable, goos string) string {
	directory := filepath.Dir(executable)
	if goos == "darwin" {
		return filepath.Clean(filepath.Join(directory, "..", "Resources", "workspace-seed"))
	}
	return filepath.Join(directory, "workspace-seed")
}

func installedManagedNodePath() (string, error) {
	executable, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("cannot locate the installed CareerOps data service: %w", err)
	}
	return managedNodePath(executable, runtime.GOOS), nil
}

func installedManagedScriptRoot() (string, error) {
	executable, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("cannot locate the installed CareerOps data service: %w", err)
	}
	return managedScriptRoot(executable, runtime.GOOS), nil
}

var managedNodeRuntime = installedManagedNodePath
var managedWorkspaceScripts = installedManagedScriptRoot

func nodeJSONResult(script string, stdout, stderr []byte, runError error) (json.RawMessage, error) {
	if runError != nil {
		details := strings.TrimSpace(string(stderr))
		if details != "" {
			return nil, fmt.Errorf("%s failed: %w: %s", script, runError, details)
		}
		return nil, fmt.Errorf("%s failed: %w", script, runError)
	}

	payload := bytes.TrimSpace(stdout)
	if !json.Valid(payload) {
		return nil, fmt.Errorf("%s did not return JSON", script)
	}
	return json.RawMessage(payload), nil
}

// runNodeJSON keeps language domain logic in the root Node entrypoints. The
// Go sidecar validates and forwards their JSON without interpreting it.
func runNodeJSON(root, script string, args ...string) (json.RawMessage, error) {
	nodeRuntime, err := managedNodeRuntime()
	if err != nil {
		return nil, err
	}
	scriptRoot, err := managedWorkspaceScripts()
	if err != nil {
		return nil, err
	}
	command := exec.Command(nodeRuntime, append([]string{filepath.Join(scriptRoot, script)}, args...)...)
	command.Dir = root
	var stderr bytes.Buffer
	command.Stderr = &stderr
	stdout, runError := command.Output()
	return nodeJSONResult(script, stdout, stderr.Bytes(), runError)
}

func runProfileLanguage(root string, args ...string) (json.RawMessage, error) {
	return runNodeJSON(root, "profile-language.mjs", args...)
}

func runJobLanguage(root, text string) (json.RawMessage, error) {
	return runNodeJSON(root, "job-language.mjs", "--resolve", text)
}
