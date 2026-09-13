//go:build windows

package main

import (
	"os/exec"
	"syscall"
	"testing"
)

func TestHideWindowSuppressesTheConsoleWindow(t *testing.T) {
	cmd := exec.Command("cmd", "/c", "exit 0")
	hideWindow(cmd)
	if cmd.SysProcAttr == nil {
		t.Fatal("hideWindow left SysProcAttr nil, so CreateProcess would open a console window")
	}
	if !cmd.SysProcAttr.HideWindow {
		t.Error("HideWindow is false")
	}
	if cmd.SysProcAttr.CreationFlags&createNoWindow == 0 {
		t.Errorf("CreationFlags %#x lacks CREATE_NO_WINDOW", cmd.SysProcAttr.CreationFlags)
	}
}

func TestHideWindowKeepsExistingCreationFlags(t *testing.T) {
	cmd := exec.Command("cmd", "/c", "exit 0")
	cmd.SysProcAttr = &syscall.SysProcAttr{CreationFlags: 0x200} // CREATE_NEW_PROCESS_GROUP
	hideWindow(cmd)
	if cmd.SysProcAttr.CreationFlags&0x200 == 0 {
		t.Errorf("CreationFlags %#x dropped the caller's flag", cmd.SysProcAttr.CreationFlags)
	}
	if cmd.SysProcAttr.CreationFlags&createNoWindow == 0 || !cmd.SysProcAttr.HideWindow {
		t.Errorf("CreationFlags %#x / HideWindow %v did not add the console suppression", cmd.SysProcAttr.CreationFlags, cmd.SysProcAttr.HideWindow)
	}
}
