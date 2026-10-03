package builtin

import (
	"encoding/json"
	"fmt"

	"reasonix/internal/base/fileutil"
	"reasonix/internal/state/sessiontemp"
)

// ResolveWritePath preserves the writer's argument semantics, including spaces
// and session-temp expansion. Claims and concrete writers must use this path.
func ResolveWritePath(workDir string, temp *sessiontemp.Manager, path string) string {
	path, _ = canonicalWriterPath(workDir, temp, path)
	return path
}

func canonicalWriterPath(workDir string, temp *sessiontemp.Manager, path string) (string, error) {
	path = resolveIn(workDir, resolveSessionTemp(temp, path))
	canonical, err := fileutil.CanonicalWritePath(path)
	if err != nil {
		return path, err
	}
	return canonical, nil
}

// ResolveWritePaths shares argument parsing with named writer contracts.
func ResolveWritePaths(workDir string, temp *sessiontemp.Manager, args json.RawMessage, move bool) ([]string, error) {
	var p struct {
		Path        string `json:"path"`
		Source      string `json:"source_path"`
		Destination string `json:"destination_path"`
	}
	if err := json.Unmarshal(args, &p); err != nil {
		return nil, fmt.Errorf("invalid args: %w", err)
	}
	paths := []string{p.Path}
	if move {
		paths = []string{p.Source, p.Destination}
	}
	for i, path := range paths {
		if path == "" {
			return nil, fmt.Errorf("write path is required")
		}
		resolved, err := canonicalWriterPath(workDir, temp, path)
		if err != nil {
			return nil, err
		}
		paths[i] = resolved
	}
	return paths, nil
}

func (w writeFile) WritePaths(args json.RawMessage) ([]string, error) {
	return ResolveWritePaths(w.workDir, w.sessionTemp, args, false)
}
func (w editFile) WritePaths(args json.RawMessage) ([]string, error) {
	return ResolveWritePaths(w.workDir, w.sessionTemp, args, false)
}
func (w multiEdit) WritePaths(args json.RawMessage) ([]string, error) {
	return ResolveWritePaths(w.workDir, w.sessionTemp, args, false)
}
func (w notebookEdit) WritePaths(args json.RawMessage) ([]string, error) {
	return ResolveWritePaths(w.workDir, w.sessionTemp, args, false)
}
func (w deleteRange) WritePaths(args json.RawMessage) ([]string, error) {
	return ResolveWritePaths(w.workDir, w.sessionTemp, args, false)
}
func (w deleteSymbol) WritePaths(args json.RawMessage) ([]string, error) {
	return ResolveWritePaths(w.workDir, w.sessionTemp, args, false)
}
func (w moveFile) WritePaths(args json.RawMessage) ([]string, error) {
	return ResolveWritePaths(w.workDir, w.sessionTemp, args, true)
}
