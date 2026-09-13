//go:build windows

package main

import (
	"os/exec"
	"syscall"
)

// createNoWindow is CREATE_NO_WINDOW from CreateProcess: the child is a
// console process that runs without a console window.
const createNoWindow = 0x08000000

// hideWindow keeps a console child from opening a window. This sidecar is
// launched by the desktop app with CREATE_NO_WINDOW, so it has a console
// without a window; a child spawned without the same flag inherits that
// console on some paths and, on others (provider shims, node), makes
// Windows allocate a fresh visible cmd.exe window that flashes over the
// GUI for the duration of the task.
func hideWindow(cmd *exec.Cmd) {
	if cmd.SysProcAttr == nil {
		cmd.SysProcAttr = &syscall.SysProcAttr{}
	}
	cmd.SysProcAttr.HideWindow = true
	cmd.SysProcAttr.CreationFlags |= createNoWindow
}
