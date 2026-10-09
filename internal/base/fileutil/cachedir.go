package fileutil

import (
	"bytes"
	"io"
	"os"
	"path/filepath"
)

const (
	cacheDirTag       = "CACHEDIR.TAG"
	cacheDirSignature = "Signature: 8a477f597d28d172789f06886806bc55"
)

// IsTaggedCacheDir reports whether dir declares itself a cache through the
// Cache Directory Tagging Specification: a CACHEDIR.TAG whose first line is the
// fixed signature. The tool that owns the directory says so, not its name.
func IsTaggedCacheDir(dir string) bool {
	f, err := os.Open(filepath.Join(dir, cacheDirTag))
	if err != nil {
		return false
	}
	defer f.Close()
	head := make([]byte, len(cacheDirSignature))
	if _, err := io.ReadFull(f, head); err != nil {
		return false
	}
	return bytes.Equal(head, []byte(cacheDirSignature))
}
