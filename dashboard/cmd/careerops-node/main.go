package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
)

const resourceDirEnvironment = "CAREEROPS_RESOURCE_DIR"

func packagedRuntimePath(executable, resourceDir, goos string) (string, error) {
	if resourceDir == "" {
		switch goos {
		case "darwin":
			resourceDir = filepath.Clean(filepath.Join(filepath.Dir(executable), "..", "Resources"))
		case "windows":
			resourceDir = filepath.Dir(executable)
		default:
			return "", errors.New("CAREEROPS_RESOURCE_DIR is required on this platform")
		}
	}
	name := "careerops-node-runtime"
	if goos == "windows" {
		name += ".exe"
	}
	return filepath.Join(resourceDir, "runtime", name), nil
}

func runtimeArgs(args []string) []string {
	result := make([]string, 1, len(args)+1)
	result[0] = "--jitless"
	for _, arg := range args {
		if arg == "--no-jitless" || strings.HasPrefix(arg, "--jitless=") {
			continue
		}
		result = append(result, arg)
	}
	return result
}

func runtimeEnvironment(environment []string) []string {
	result := make([]string, 0, len(environment)+1)
	for _, item := range environment {
		if !strings.HasPrefix(strings.ToUpper(item), "NODE_OPTIONS=") {
			result = append(result, item)
		}
	}
	return append(result, "NODE_OPTIONS=--jitless")
}

func run() error {
	executable, err := os.Executable()
	if err != nil {
		return fmt.Errorf("cannot locate the CareerOps launcher: %w", err)
	}
	runtimePath, err := packagedRuntimePath(executable, os.Getenv(resourceDirEnvironment), runtime.GOOS)
	if err != nil {
		return err
	}
	command := exec.Command(runtimePath, runtimeArgs(os.Args[1:])...)
	command.Env = runtimeEnvironment(os.Environ())
	command.Stdin = os.Stdin
	command.Stdout = os.Stdout
	command.Stderr = os.Stderr
	return command.Run()
}

func main() {
	if err := run(); err != nil {
		var exitError *exec.ExitError
		if errors.As(err, &exitError) {
			os.Exit(exitError.ExitCode())
		}
		fmt.Fprintf(os.Stderr, "CareerOps managed JavaScript runtime unavailable: %v. Reinstall or update CareerOps Desktop.\n", err)
		os.Exit(1)
	}
}
