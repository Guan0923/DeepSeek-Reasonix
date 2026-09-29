package openai

import (
	"fmt"

	"reasonix/internal/contract/provider"
)

func resolveZhipuEffort(name, model, effort string) (string, error) {
	switch model {
	case "glm-5.2":
		switch effort {
		case "enabled":
			return "max", nil
		case "disabled":
			return "none", nil
		case "", "none", "minimal", "low", "medium", "high", "xhigh", "max":
			return effort, nil
		default:
			return "", fmt.Errorf("openai: provider %q: GLM-5.2 effort must be none, minimal, low, medium, high, xhigh, or max", name)
		}
	case "glm-5.3", "glm-5.3-flash":
		switch effort {
		case "enabled":
			return "max", nil
		case "disabled":
			return "low", nil // persisted off switch cannot be sent to a forced-thinking model
		case "", "low", "high", "max":
			return effort, nil
		default:
			return "", fmt.Errorf("openai: provider %q: GLM-5.3 effort must be low, high, or max", name)
		}
	default:
		switch effort {
		case "", "enabled", "disabled":
			return effort, nil
		default:
			return "", fmt.Errorf("openai: provider %q uses Zhipu thinking; effort must be enabled or disabled", name)
		}
	}
}

func (c *client) glmThinkingEnabled() bool {
	if c == nil || !c.zhipu {
		return false
	}
	if c.zhipuDepth == "glm-5.3" || c.zhipuDepth == "glm-5.3-flash" {
		return true
	}
	if c.zhipuDepth == "glm-5.2" && (c.effort == "none" || c.effort == "minimal") {
		return false
	}
	t := c.effort
	if c.thinkingType != "" {
		t = c.thinkingType
	}
	return t != "disabled"
}

func (c *client) applyZhipuEffort(out *chatRequest, req provider.Request) {
	if c.zhipuDepth == "" {
		t := c.effort
		if t == "" {
			t = "enabled"
		}
		if c.thinkingType != "" {
			t = c.thinkingType
		}
		out.Thinking = &thinkingMode{Type: t}
		out.ReasoningEffort = ""
		return
	}
	depth := c.requestEffort(req)
	if c.zhipuDepth == "glm-5.3" || c.zhipuDepth == "glm-5.3-flash" {
		out.Thinking = &thinkingMode{Type: "enabled"}
		if c.thinkingType == "disabled" {
			depth = "low"
		}
	} else if c.thinkingType == "disabled" || depth == "none" || depth == "minimal" {
		out.Thinking = &thinkingMode{Type: "disabled"}
		depth = ""
	} else {
		out.Thinking = &thinkingMode{Type: "enabled"}
	}
	out.ReasoningEffort = depth
}
