package agent

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"

	"reasonix/internal/base/testenv"
	"reasonix/internal/contract/event"
	"reasonix/internal/contract/provider"
	"reasonix/internal/contract/tool"
	"reasonix/internal/runtime/agent/testutil"
)

// truncatingProvider cuts every summary whose output cap is at or below
// truncateAtOrBelow, the way a model spending its budget on reasoning does.
type truncatingProvider struct {
	mu                 sync.Mutex
	truncateAtOrBelow  int
	caps               []int
	sawSystemPrompts   []string
	sawTranscriptSizes []int
}

func (p *truncatingProvider) Name() string { return "truncating" }

func (p *truncatingProvider) Stream(_ context.Context, req provider.Request) (<-chan provider.Chunk, error) {
	p.mu.Lock()
	p.caps = append(p.caps, req.MaxTokens)
	p.sawSystemPrompts = append(p.sawSystemPrompts, req.Messages[0].Content)
	p.sawTranscriptSizes = append(p.sawTranscriptSizes, len(req.Messages[1].Content))
	p.mu.Unlock()
	ch := make(chan provider.Chunk, 3)
	if req.MaxTokens <= p.truncateAtOrBelow {
		ch <- provider.Chunk{Type: provider.ChunkText, Text: "## Goal\ncut off mid"}
		ch <- provider.Chunk{Type: provider.ChunkUsage, Usage: &provider.Usage{PromptTokens: 100, CompletionTokens: req.MaxTokens, TotalTokens: 100 + req.MaxTokens, FinishReason: "length"}}
	} else {
		ch <- provider.Chunk{Type: provider.ChunkText, Text: testutil.SummaryReply(req, "complete briefing")}
		ch <- provider.Chunk{Type: provider.ChunkUsage, Usage: &provider.Usage{PromptTokens: 100, CompletionTokens: 40, TotalTokens: 140, FinishReason: "stop"}}
	}
	close(ch)
	return ch, nil
}

func truncationAgent(t *testing.T, p provider.Provider, maxOut int) *Agent {
	t.Helper()
	return New(p, tool.NewRegistry(), foldableSessionOverForce(6), Options{
		ContextWindow:   5000,
		CompactRatio:    0.5,
		RecentKeep:      2,
		MaxOutputTokens: maxOut,
		ArchiveDir:      testenv.TempDir(t),
	}, event.Discard)
}

func TestTruncatedSummaryRetriesOnceWithLargerOutputBudget(t *testing.T) {
	p := &truncatingProvider{truncateAtOrBelow: summaryOutputMaxTokens}
	a := truncationAgent(t, p, 4*summaryOutputMaxTokens)

	if err := prepareContext(context.Background(), a, CompactionTriggerOverflow); err != nil {
		t.Fatalf("prepare = %v", err)
	}
	if len(p.caps) != 2 || p.caps[0] != summaryOutputMaxTokens || p.caps[1] <= p.caps[0] || p.caps[1] > 2*summaryOutputMaxTokens {
		t.Fatalf("summary caps = %v, want one request at the base cap then one retry above it, at most doubled", p.caps)
	}
	if p.sawSystemPrompts[0] != p.sawSystemPrompts[1] || p.sawTranscriptSizes[0] != p.sawTranscriptSizes[1] {
		t.Fatal("retry changed the request bytes; only the output cap may differ so the input stays cache-warm")
	}
	if degradedFold(a) {
		t.Fatal("retry succeeded but the fold was still degraded to the mechanical digest")
	}
	if got := latestDigest(a.sess.win.compactionState.Projection.Messages); !strings.Contains(got, "complete briefing") {
		t.Fatalf("digest = %q, want the retried summary installed", got)
	}
}

func TestTruncatedSummaryRetryIsBoundedAndAttributed(t *testing.T) {
	p := &truncatingProvider{truncateAtOrBelow: 1 << 30}
	a := truncationAgent(t, p, 4*summaryOutputMaxTokens)
	before := len(a.sess.conversation.Messages)

	err := prepareContext(context.Background(), a, CompactionTriggerManual)
	if !errors.Is(err, errSummaryOutputTruncated) {
		t.Fatalf("prepare = %v, want the typed truncation identity", err)
	}
	if compactionFailureCode(err) != FailSummaryTruncated {
		t.Fatalf("failure code = %q, want %q", compactionFailureCode(err), FailSummaryTruncated)
	}
	if len(p.caps) != 2 {
		t.Fatalf("summary requests = %d (%v), want exactly one retry", len(p.caps), p.caps)
	}
	if after := len(a.sess.conversation.Messages); after != before {
		t.Fatalf("conversation changed from %d to %d messages on a failed compaction", before, after)
	}
	if hasCompactionSummary(visibleContext(a)) {
		t.Fatal("a truncated summary was installed")
	}
}

func TestTruncatedSummaryWithNoHeadroomDoesNotRetry(t *testing.T) {
	p := &truncatingProvider{truncateAtOrBelow: 1 << 30}
	a := truncationAgent(t, p, summaryOutputMaxTokens)

	err := prepareContext(context.Background(), a, CompactionTriggerManual)
	if !errors.Is(err, errSummaryOutputTruncated) {
		t.Fatalf("prepare = %v, want truncation", err)
	}
	if len(p.caps) != 1 {
		t.Fatalf("summary requests = %d, want 1: the model cap leaves nothing to grow into", len(p.caps))
	}
}
