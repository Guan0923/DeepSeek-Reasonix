package pluginpkg

import (
	"os"
	"path/filepath"
	"slices"
	"strings"

	"reasonix/internal/contract/config"
)

func scanAgentRefs(root *os.Root, dir string, depth int, seen *[]os.FileInfo, out *[]AgentRef) {
	info, source := agentPathInfo(root, dir)
	if source == nil {
		return
	}
	defer source.Close()
	if !info.IsDir() {
		return
	}
	for _, previous := range *seen {
		if os.SameFile(previous, info) {
			return
		}
	}
	*seen = append(*seen, info)
	entries, err := source.ReadDir(-1)
	if err != nil {
		return
	}
	slices.SortFunc(entries, func(a, b os.DirEntry) int { return strings.Compare(a.Name(), b.Name()) })
	for _, entry := range entries {
		path := filepath.Join(dir, entry.Name())
		entryInfo, handle := agentPathInfo(root, path)
		if handle == nil {
			continue
		}
		handle.Close()
		var ref AgentRef
		var ok bool
		if entryInfo.IsDir() {
			ref, ok = parseAgentRef(root, filepath.Join(path, "SKILL.md"), entry.Name())
		} else if strings.EqualFold(filepath.Ext(entry.Name()), ".md") {
			ref, ok = parseAgentRef(root, path, strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name())))
		}
		if ok {
			if depth == 1 || ref.Description != "" {
				*out = append(*out, ref)
			}
			continue
		}
		if entryInfo.IsDir() && depth < (&config.Config{}).SkillMaxDepth() && !shouldSkipSkillScanDir(entry.Name()) {
			scanAgentRefs(root, path, depth+1, seen, out)
		}
	}
}
