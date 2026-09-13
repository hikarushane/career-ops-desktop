//go:build !windows

package main

import "os/exec"

// hideWindow is a no-op off Windows: POSIX child processes never open a
// console window, so there is nothing to suppress.
func hideWindow(cmd *exec.Cmd) {}
