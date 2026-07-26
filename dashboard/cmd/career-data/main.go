// Command career-data exposes the career-ops dashboard data layer as JSON on
// stdout, for the Tauri desktop app to consume.
//
// It imports the TUI's data package and adds nothing to it. Existing files
// under dashboard/ are never modified, because update-system.mjs reverts
// modifications to system paths but leaves new files alone.
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
)

// errorPayload is the shape every failure takes on stdout.
type errorPayload struct {
	OK      bool   `json:"ok"`
	Error   string `json:"error"`
	Message string `json:"message"`
}

// emit writes v as JSON to stdout and reports the process exit code.
func emit(v any) int {
	enc := json.NewEncoder(os.Stdout)
	if err := enc.Encode(v); err != nil {
		fmt.Fprintf(os.Stderr, "encode: %v\n", err)
		return 1
	}
	return 0
}

// fail writes a machine-readable error to stdout, a human-readable one to
// stderr, and reports exit code 1.
func fail(code, message string) int {
	fmt.Fprintf(os.Stderr, "%s: %s\n", code, message)
	_ = emit(errorPayload{OK: false, Error: code, Message: message})
	return 1
}

const usage = `career-data <command> [flags]

Commands:
  doctor      --path <dir>
  list        --path <dir>
  report      --path <dir> --file <reportPath>
  set-status  --path <dir> --report-number <n> --expect-status <s> --status <s>
`

func main() {
	os.Exit(run(os.Args[1:]))
}

func run(args []string) int {
	if len(args) == 0 {
		fmt.Fprint(os.Stderr, usage)
		return fail("usage", "no command given")
	}

	cmd, rest := args[0], args[1:]

	switch cmd {
	case "doctor":
		fs := flag.NewFlagSet("doctor", flag.ContinueOnError)
		path := fs.String("path", "", "career-ops root directory")
		if err := fs.Parse(rest); err != nil {
			return fail("usage", err.Error())
		}
		if *path == "" {
			return fail("usage", "--path is required")
		}
		return emit(runDoctor(*path))

	case "list":
		fs := flag.NewFlagSet("list", flag.ContinueOnError)
		path := fs.String("path", "", "career-ops root directory")
		if err := fs.Parse(rest); err != nil {
			return fail("usage", err.Error())
		}
		if *path == "" {
			return fail("usage", "--path is required")
		}
		res, err := runList(*path)
		if err != nil {
			return fail("not-found", "applications.md not found under "+*path)
		}
		return emit(res)

	default:
		fmt.Fprint(os.Stderr, usage)
		return fail("usage", "unknown command: "+cmd)
	}
}
