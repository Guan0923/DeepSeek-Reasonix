package agent

import (
	"path/filepath"
	"runtime"
	"strings"

	"reasonix/internal/base/fileutil"
	"reasonix/internal/runtime/taskmonitor"
)

// hostOwnedPath reports whether path is state the host or a tool wrote about
// the work rather than the work: the task-snapshot store, or anything under a
// directory that tagged itself a cache.
func hostOwnedPath(root, path string) bool {
	if !filepath.IsAbs(path) {
		path = filepath.Join(root, path)
	}
	rel, err := filepath.Rel(root, path)
	if err != nil || rel == "." {
		return false
	}
	if underDir(rel, taskmonitor.StoreDir) {
		return true
	}
	for dir := filepath.Dir(path); ; dir = filepath.Dir(dir) {
		if dir == root || len(dir) <= len(root) {
			return false
		}
		if fileutil.IsTaggedCacheDir(dir) {
			return true
		}
	}
}

func underDir(rel, dir string) bool {
	rel, dir = filepath.ToSlash(rel), filepath.ToSlash(dir)
	if runtime.GOOS == "windows" {
		rel, dir = strings.ToLower(rel), strings.ToLower(dir)
	}
	return rel == dir || strings.HasPrefix(rel, dir+"/")
}
