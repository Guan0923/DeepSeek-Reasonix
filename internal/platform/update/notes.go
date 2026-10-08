package update

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"reasonix/internal/base/fileutil"
	"reasonix/internal/base/netclient"
	"reasonix/internal/contract/config"
)

// Each refusal is a different next step: a malformed version is the caller's,
// an absent or unreachable object is the mirror's, and the kernel decides none
// of them from a message.
var (
	ErrNotesBadVersion  = errors.New("update: not a release version")
	ErrNotesAbsent      = errors.New("update: this release has no published notes")
	ErrNotesUnreachable = errors.New("update: the release notes could not be fetched")
	ErrNotesTooLarge    = errors.New("update: release notes exceed the allowed size")
)

// NotesMaxBytes bounds one notes document. The largest shipped is 40 KB.
const NotesMaxBytes = 256 << 10

const (
	notesTimeout = 15 * time.Second
	notesFailTTL = 60 * time.Second
)

// VersionNotes is one release's notes as the version panel shows them.
type VersionNotes struct {
	Version  string `json:"version"`
	Markdown string `json:"markdown"`
	Cached   bool   `json:"cached"`
}

var releaseVersion = regexp.MustCompile(`^v?([0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z][0-9A-Za-z.]*)?)$`)

// NotesURL is where a release's notes live. It is built from a validated
// version and the mirror constant, never from the catalog: the catalog only
// says whether notes exist, so it cannot aim this fetch anywhere.
func NotesURL(version string) (string, error) {
	m := releaseVersion.FindStringSubmatch(strings.TrimSpace(version))
	if m == nil {
		return "", ErrNotesBadVersion
	}
	return StudioMirror + "/studio/notes/" + m[1] + ".md", nil
}

type notesFlight struct {
	done chan struct{}
	res  VersionNotes
	err  error
}

type notesFailure struct {
	err   error
	until time.Time
}

// notesState owns what outlives one request: the fetches in flight, which a
// second click joins, and the recent failures, which it does not repeat.
type notesState struct {
	mu       sync.Mutex
	inflight map[string]*notesFlight
	failed   map[string]notesFailure
}

var sharedNotes = &notesState{}

// ReadNotes returns a release's notes from disk when they were ever fetched and
// from the mirror otherwise. A fetched document is kept for good: a released
// version's notes do not change. retry skips the short memory of a failure.
func ReadNotes(ctx context.Context, in Install, version string, retry bool) (VersionNotes, error) {
	client, err := netclient.NewHTTPClient(ProxySpec(), netclient.TransportOptions{})
	if err != nil {
		return VersionNotes{}, fmt.Errorf("%w: %v", ErrNotesUnreachable, err)
	}
	dir := ""
	if root := config.CacheDir(); root != "" {
		dir = filepath.Join(root, "release-notes")
	}
	return sharedNotes.read(ctx, notesRequest{dir: dir, client: client, userAgent: UserAgent(in.Version), retry: retry}, version)
}

type notesRequest struct {
	dir       string
	client    *http.Client
	userAgent string
	retry     bool
}

func (s *notesState) read(ctx context.Context, rq notesRequest, version string) (VersionNotes, error) {
	url, err := NotesURL(version)
	if err != nil {
		return VersionNotes{}, err
	}
	key := releaseVersion.FindStringSubmatch(strings.TrimSpace(version))[1]
	if md, ok := readNotesFile(rq.dir, key); ok {
		return VersionNotes{Version: key, Markdown: md, Cached: true}, nil
	}

	s.mu.Lock()
	if f, ok := s.failed[key]; ok && !rq.retry && time.Now().Before(f.until) {
		s.mu.Unlock()
		return VersionNotes{}, f.err
	}
	fl, joined := s.inflight[key]
	if !joined {
		if s.inflight == nil {
			s.inflight, s.failed = map[string]*notesFlight{}, map[string]notesFailure{}
		}
		fl = &notesFlight{done: make(chan struct{})}
		s.inflight[key] = fl
		go s.fetch(rq, key, url, fl)
	}
	s.mu.Unlock()

	select {
	case <-fl.done:
		return fl.res, fl.err
	case <-ctx.Done():
		return VersionNotes{}, ctx.Err()
	}
}

// The fetch outlives the click that started it: a second click may be waiting
// on the same result, and abandoning it would fail both.
func (s *notesState) fetch(rq notesRequest, key, url string, fl *notesFlight) {
	ctx, cancel := context.WithTimeout(context.Background(), notesTimeout)
	defer cancel()
	md, err := fetchNotes(ctx, guarded(rq.client), url, rq.userAgent)
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.inflight, key)
	if err != nil {
		s.failed[key] = notesFailure{err: err, until: time.Now().Add(notesFailTTL)}
		fl.err = err
	} else {
		delete(s.failed, key)
		// A document the disk would not take is still the answer; it is
		// fetched again next time.
		writeNotesFile(rq.dir, key, md)
		fl.res = VersionNotes{Version: key, Markdown: md}
	}
	close(fl.done)
}

func fetchNotes(ctx context.Context, c *http.Client, url, userAgent string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrNotesUnreachable, err)
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept", "text/markdown, text/plain")
	resp, err := c.Do(req)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrNotesUnreachable, err)
	}
	defer resp.Body.Close()
	switch {
	case resp.StatusCode == http.StatusNotFound:
		return "", ErrNotesAbsent
	case resp.StatusCode != http.StatusOK:
		return "", fmt.Errorf("%w: %s", ErrNotesUnreachable, resp.Status)
	case resp.ContentLength > NotesMaxBytes:
		return "", ErrNotesTooLarge
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, NotesMaxBytes+1))
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrNotesUnreachable, err)
	}
	if len(body) > NotesMaxBytes {
		return "", ErrNotesTooLarge
	}
	if !usableNotes(body) {
		return "", fmt.Errorf("%w: the mirror answered something that is not a document", ErrNotesUnreachable)
	}
	return string(body), nil
}

func usableNotes(b []byte) bool {
	return len(strings.TrimSpace(string(b))) > 0 && utf8.Valid(b)
}

// A file that fails the same test as a fresh response is a miss, so a torn or
// emptied cache entry costs one fetch rather than a blank panel.
func readNotesFile(dir, key string) (string, bool) {
	if dir == "" {
		return "", false
	}
	f, err := os.Open(filepath.Join(dir, key+".md"))
	if err != nil {
		return "", false
	}
	defer f.Close()
	b, err := io.ReadAll(io.LimitReader(f, NotesMaxBytes+1))
	if err != nil || len(b) > NotesMaxBytes || !usableNotes(b) {
		return "", false
	}
	return string(b), true
}

func writeNotesFile(dir, key, md string) {
	if dir == "" || os.MkdirAll(dir, 0o700) != nil {
		return
	}
	_ = fileutil.AtomicWriteFile(filepath.Join(dir, key+".md"), []byte(md), 0o600)
}
