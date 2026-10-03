package remote

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"
)

type blockingSessionClient struct {
	started   chan struct{}
	closed    chan struct{}
	closeOnce sync.Once
}

func (c *blockingSessionClient) NewSession() (*ssh.Session, error) {
	close(c.started)
	<-c.closed
	return nil, errors.New("session client closed")
}

func (c *blockingSessionClient) Close() error {
	c.closeOnce.Do(func() { close(c.closed) })
	return nil
}

func TestOpenExecSessionCancellationUnblocksNewSession(t *testing.T) {
	client := &blockingSessionClient{
		started: make(chan struct{}),
		closed:  make(chan struct{}),
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan error, 1)
	go func() {
		_, stopClose, err := openExecSession(ctx, client)
		if stopClose != nil {
			stopClose()
		}
		done <- err
	}()

	select {
	case <-client.started:
	case <-time.After(2 * time.Second):
		t.Fatal("NewSession was not called")
	}
	cancel()

	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("openExecSession error = %v, want context.Canceled", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("cancellation did not unblock NewSession")
	}
}
