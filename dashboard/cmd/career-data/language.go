package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
)

// runNodeJSON keeps language domain logic in the root Node entrypoints. The
// Go sidecar validates and forwards their JSON without interpreting it.
func runNodeJSON(root, script string, args ...string) (json.RawMessage, error) {
	command := exec.Command("node", append([]string{script}, args...)...)
	command.Dir = root
	output, err := command.CombinedOutput()
	if err != nil {
		details := strings.TrimSpace(string(output))
		if details != "" {
			return nil, fmt.Errorf("%s failed: %w: %s", script, err, details)
		}
		return nil, fmt.Errorf("%s failed: %w", script, err)
	}

	payload := bytes.TrimSpace(output)
	if !json.Valid(payload) {
		return nil, fmt.Errorf("%s did not return JSON", script)
	}
	return json.RawMessage(payload), nil
}

func runProfileLanguage(root string, args ...string) (json.RawMessage, error) {
	return runNodeJSON(root, "profile-language.mjs", args...)
}

func runJobLanguage(root, text string) (json.RawMessage, error) {
	return runNodeJSON(root, "job-language.mjs", "--resolve", text)
}
