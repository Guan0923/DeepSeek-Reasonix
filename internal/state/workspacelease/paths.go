package workspacelease

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"reasonix/internal/base/fileutil"
)

type pathLeaseState struct {
	root   string
	paths  []string
	record string
}

type pathLeaseRecord struct {
	Holder string   `json:"holder"`
	Paths  []string `json:"paths"`
}

func (o *Owner) normalizePaths(paths []string) []string {
	if len(paths) == 0 {
		return nil
	}
	out := make([]string, 0, len(paths))
	for _, path := range paths {
		if strings.TrimSpace(path) == "" {
			return nil
		}
		if !filepath.IsAbs(path) {
			path = filepath.Join(o.scope.root, path)
		}
		path = filepath.Clean(path)
		parent, tail := path, ""
		for {
			resolved, err := filepath.EvalSymlinks(parent)
			if err == nil {
				path = filepath.Join(resolved, tail)
				break
			}
			if !os.IsNotExist(err) {
				return nil
			}
			if info, err := os.Lstat(parent); err == nil && info.Mode()&os.ModeSymlink != 0 {
				return nil
			}
			next := filepath.Dir(parent)
			if next == parent {
				return nil
			}
			tail = filepath.Join(filepath.Base(parent), tail)
			parent = next
		}
		if !pathWithin(o.scope.root, path) {
			return nil
		}
		out = append(out, path)
	}
	return out
}

func pathWithin(root, path string) bool {
	if runtime.GOOS == "windows" || runtime.GOOS == "darwin" {
		root, path = strings.ToLower(root), strings.ToLower(path)
	}
	rel, err := filepath.Rel(root, path)
	return err == nil && (rel == "." || (rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))))
}

func coversPaths(held, requested []string) bool {
	if len(held) == 0 {
		return true
	}
	if len(requested) == 0 {
		return false
	}
	for _, path := range requested {
		covered := false
		for _, root := range held {
			if pathWithin(root, path) {
				covered = true
				break
			}
		}
		if !covered {
			return false
		}
	}
	return true
}

func mergePaths(held, requested []string) []string {
	if len(held) == 0 || len(requested) == 0 {
		return nil
	}
	return append(append([]string(nil), held...), requested...)
}

func pathsOverlap(a, b []string) bool {
	if len(a) == 0 || len(b) == 0 {
		return true
	}
	for _, x := range a {
		for _, y := range b {
			if pathWithin(x, y) || pathWithin(y, x) {
				return true
			}
		}
	}
	return false
}

func (o *Owner) acquirePaths(ctx context.Context, paths []string, held bool) (func(), error) {
	w := &waitClock{owner: o}
	for {
		if err := ctx.Err(); err != nil {
			w.close(WaitAbandoned)
			return nil, err
		}
		release, holder, err := o.tryPaths(paths, held)
		if err == nil {
			w.close(WaitAcquired)
			return release, nil
		}
		if !errors.Is(err, errHeld) {
			w.close(WaitAbandoned)
			return nil, fmt.Errorf("acquire workspace write lease: %w", err)
		}
		w.contend()
		if w.holder == "" {
			w.holder = holder
		}
		w.report()
		delay := retryInterval
		if !w.began {
			delay = min(delay, w.remainingGrace())
		}
		timer := time.NewTimer(delay)
		select {
		case <-ctx.Done():
			timer.Stop()
			w.close(WaitAbandoned)
			return nil, ctx.Err()
		case <-timer.C:
		}
	}
}

func (o *Owner) tryPaths(paths []string, held bool) (func(), string, error) {
	select {
	case <-o.local.token:
	default:
		return nil, "", errHeld
	}
	defer func() { o.local.token <- struct{}{} }()
	var shared func()
	if !held {
		// Older hosts only know the exclusive workspace lock, so every path
		// claim retains a shared lock there for cross-version exclusion.
		var err error
		shared, err = trySharedLockFile(o.lockPath)
		if err != nil {
			return nil, readHolder(o.holderPath()), err
		}
		defer func() {
			if shared != nil {
				shared()
			}
		}()
	}
	guard, err := tryLockFile(o.lockPath + ".guard")
	if err != nil {
		return nil, readHolder(o.holderPath()), err
	}
	defer guard()
	dir := o.lockPath + ".claims"
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, "", err
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, "", err
	}
	for _, entry := range entries {
		if !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		path := filepath.Join(dir, entry.Name())
		if held && path == o.scope.record {
			continue
		}
		release, err := tryLockFile(path + ".lock")
		if err == nil {
			removeErr := os.Remove(path)
			release()
			_ = os.Remove(path + ".lock")
			if removeErr != nil && !os.IsNotExist(removeErr) {
				return nil, "", removeErr
			}
			continue
		}
		if !errors.Is(err, errHeld) {
			return nil, "", err
		}
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, "", err
		}
		var record pathLeaseRecord
		if err := json.Unmarshal(data, &record); err != nil {
			return nil, "", errHeld
		}
		for _, extent := range record.Paths {
			if !filepath.IsAbs(extent) || !pathWithin(o.scope.root, extent) {
				record.Paths = nil
				break
			}
		}
		if pathsOverlap(paths, record.Paths) {
			return nil, record.Holder, errHeld
		}
	}
	if !held {
		var id [16]byte
		if _, err := rand.Read(id[:]); err != nil {
			return nil, "", err
		}
		o.scope.record = filepath.Join(dir, hex.EncodeToString(id[:])+".json")
	}
	path := o.scope.record
	var release func()
	if !held {
		release, err = tryLockFile(path + ".lock")
		if err != nil {
			return nil, "", err
		}
	}
	data, err := json.Marshal(pathLeaseRecord{Holder: o.holderName(), Paths: paths})
	if err == nil {
		err = fileutil.AtomicWriteFile(path, data, 0o600)
	}
	if err != nil {
		if release != nil {
			release()
		}
		return nil, "", err
	}
	if held {
		return nil, "", nil
	}
	sharedRelease := shared
	shared = nil
	return func() { o.releaseClaim(path, release); sharedRelease() }, "", nil
}

func (o *Owner) releaseClaim(path string, release func()) {
	<-o.local.token
	defer func() { o.local.token <- struct{}{} }()
	for {
		guard, err := tryLockFile(o.lockPath + ".guard")
		if err == nil {
			_ = os.Remove(path)
			release()
			_ = os.Remove(path + ".lock")
			guard()
			return
		}
		if !errors.Is(err, errHeld) {
			release()
			return
		}
		time.Sleep(retryInterval)
	}
}
