package tool

// MarkDisabledMCP records names that resolve to a disabled MCP tool. The tool is
// not registered, but the Agent can still explain the refusal instead of calling
// a known configuration policy "unknown".
func (r *Registry) MarkDisabledMCP(binding MCPBinding) {
	if r == nil {
		return
	}
	names := append([]string{binding.CallableName}, mcpBindingAliases(binding)...)
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.disabledMCP == nil {
		r.disabledMCP = make(map[string]bool)
	}
	for _, name := range names {
		if name != "" {
			r.disabledMCP[name] = true
		}
	}
}

// DisabledMCP reports whether name identifies a tool disabled by configuration.
func (r *Registry) DisabledMCP(name string) bool {
	if r == nil {
		return false
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.disabledMCP[name]
}
