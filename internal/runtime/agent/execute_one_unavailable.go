package agent

import (
	"context"
	"fmt"

	"reasonix/internal/contract/tool"
)

// What the model is told when a contextual tool is out of context. The tool
// answers it, because the tool is what knows; a table here keyed by name would
// go stale the first time one is added. A contextual tool that says nothing is
// a fact about the registry rather than about the call, so the host names it
// under its own code instead of leaving the reader a bare sentence.
func unavailableReason(ctx context.Context, target tool.Tool, name string) tool.Refusal {
	if r, ok := target.(tool.ContextualReasoner); ok {
		if refusal := r.Unavailable(ctx); !refusal.Empty() {
			return refusal
		}
	}
	return tool.Refusal{
		Code:    "tool.unavailable_unspecified",
		Message: fmt.Sprintf("blocked: tool %q is unavailable in the current workflow context", name),
	}
}
