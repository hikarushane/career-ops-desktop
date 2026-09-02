// Command career-data exposes the career-ops dashboard data layer as JSON on
// stdout, for the Tauri desktop app to consume.
//
// It imports the TUI's data package and adds nothing to it. Existing files
// under dashboard/ are never modified, because update-system.mjs reverts
// modifications to system paths but leaves new files alone.
package main

import (
	"encoding/json"
	"errors"
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
  contracts
  providers
  install-provider --id <provider-id>
  doctor      --path <dir>
  list        --path <dir>
  report      --path <dir> --file <reportPath>
  set-status  --path <dir> --report-number <n> --expect-status <s> --status <s>
  language-settings     --path <dir>
  set-analysis-language --path <dir> --language <ISO code>
  help-document         --path <dir> --language <ISO code>
  resolve-job-language  --path <dir> --text <job description>
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
	case "contracts":
		return emit(runContracts())

	case "providers":
		return emit(runProviders())

	case "install-provider":
		fs := flag.NewFlagSet("install-provider", flag.ContinueOnError)
		id := fs.String("id", "", "provider id to install")
		if err := fs.Parse(rest); err != nil {
			return fail("usage", err.Error())
		}
		if *id == "" {
			return fail("usage", "--id is required")
		}
		return emit(installProvider(*id))

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

	case "report":
		fs := flag.NewFlagSet("report", flag.ContinueOnError)
		path := fs.String("path", "", "career-ops root directory")
		file := fs.String("file", "", "report path, relative to the root")
		if err := fs.Parse(rest); err != nil {
			return fail("usage", err.Error())
		}
		if *path == "" || *file == "" {
			return fail("usage", "--path and --file are both required")
		}
		res, err := runReport(*path, *file)
		switch {
		case errors.Is(err, errPathEscape):
			return fail("invalid-path", "report path resolves outside the career-ops root")
		case err != nil:
			return fail("io-error", err.Error())
		}
		return emit(res)

	case "set-status":
		fs := flag.NewFlagSet("set-status", flag.ContinueOnError)
		path := fs.String("path", "", "career-ops root directory")
		number := fs.String("report-number", "", "report number, e.g. 001")
		expect := fs.String("expect-status", "", "the status the caller last saw")
		next := fs.String("status", "", "the new status")
		if err := fs.Parse(rest); err != nil {
			return fail("usage", err.Error())
		}
		if *path == "" || *number == "" || *expect == "" || *next == "" {
			return fail("usage", "--path, --report-number, --expect-status and --status are all required")
		}

		res, err := setStatus(*path, *number, *expect, *next)
		var stale *staleError
		switch {
		case errors.As(err, &stale):
			_ = emit(struct {
				OK           bool   `json:"ok"`
				Error        string `json:"error"`
				Message      string `json:"message"`
				ActualStatus string `json:"actualStatus"`
			}{
				OK:    false,
				Error: "stale",
				Message: fmt.Sprintf(
					"Row %s currently reads %q, expected %q. The file changed outside the app.",
					*number, stale.Actual, *expect),
				ActualStatus: stale.Actual,
			})
			return 1
		case errors.Is(err, errInvalidStatus):
			return fail("invalid-status", err.Error())
		case errors.Is(err, errRowNotFound):
			return fail("not-found", err.Error())
		case errors.Is(err, errAmbiguousRow):
			return fail("ambiguous-row", err.Error())
		case errors.Is(err, errNoTracker):
			return fail("not-found", "applications.md not found under "+*path)
		case err != nil:
			return fail("io-error", err.Error())
		}
		return emit(res)

	case "language-settings":
		fs := flag.NewFlagSet("language-settings", flag.ContinueOnError)
		path := fs.String("path", "", "career-ops root directory")
		if err := fs.Parse(rest); err != nil {
			return fail("usage", err.Error())
		}
		if *path == "" {
			return fail("usage", "--path is required")
		}
		res, err := runProfileLanguage(*path, "--settings")
		if err != nil {
			return fail("language-error", err.Error())
		}
		return emit(res)

	case "set-analysis-language":
		fs := flag.NewFlagSet("set-analysis-language", flag.ContinueOnError)
		path := fs.String("path", "", "career-ops root directory")
		language := fs.String("language", "", "analysis language ISO code")
		if err := fs.Parse(rest); err != nil {
			return fail("usage", err.Error())
		}
		if *path == "" || *language == "" {
			return fail("usage", "--path and --language are both required")
		}
		res, err := runProfileLanguage(*path, "--set-analysis", *language)
		if err != nil {
			return fail("language-error", err.Error())
		}
		return emit(res)

	case "help-document":
		fs := flag.NewFlagSet("help-document", flag.ContinueOnError)
		path := fs.String("path", "", "career-ops root directory")
		language := fs.String("language", "", "guide language ISO code")
		if err := fs.Parse(rest); err != nil {
			return fail("usage", err.Error())
		}
		if *path == "" || *language == "" {
			return fail("usage", "--path and --language are both required")
		}
		res, err := runProfileLanguage(*path, "--help-readme", *language)
		if err != nil {
			return fail("language-error", err.Error())
		}
		return emit(res)

	case "resolve-job-language":
		fs := flag.NewFlagSet("resolve-job-language", flag.ContinueOnError)
		path := fs.String("path", "", "career-ops root directory")
		text := fs.String("text", "", "job description text")
		if err := fs.Parse(rest); err != nil {
			return fail("usage", err.Error())
		}
		if *path == "" || *text == "" {
			return fail("usage", "--path and --text are both required")
		}
		res, err := runJobLanguage(*path, *text)
		if err != nil {
			return fail("language-error", err.Error())
		}
		return emit(res)

	default:
		fmt.Fprint(os.Stderr, usage)
		return fail("usage", "unknown command: "+cmd)
	}
}
