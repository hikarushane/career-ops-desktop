//go:build !windows

package main

import (
	"os/exec"
	"testing"
)

func TestHideWindowIsANoOpOffWindows(t *testing.T) {
	cmd := exec.Command("true")
	hideWindow(cmd)
	if cmd.SysProcAttr != nil {
		t.Fatalf("hideWindow set SysProcAttr %+v off Windows", cmd.SysProcAttr)
	}
}
