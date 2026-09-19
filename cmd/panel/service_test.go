package main

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/amirotin/telemt_panel/internal/host"
)

func writeCustomServiceConfig(t *testing.T) (string, string, string) {
	t.Helper()
	dir := t.TempDir()
	dataDir := filepath.Join(dir, "must-not-open-state")
	database := filepath.Join(dir, "must-not-open-history.db")
	path := filepath.Join(dir, "config.toml")
	raw := `data_dir = "` + dataDir + `"
[telemt]
url = "http://127.0.0.1:9091"
[auth]
disabled = true
[store]
driver = "sqlite"
path = "` + database + `"
[host]
service_manager = "custom"
telemt_service = "telemt-custom"
panel_service = "panel-custom"
[host.commands.telemt]
start = ["/opt/etc/init.d/S99telemt", "start"]
stop = ["/opt/etc/init.d/S99telemt", "stop"]
restart = ["/opt/etc/init.d/S99telemt", "restart"]
[host.commands.panel]
restart = ["/opt/etc/init.d/S99telemt-panel", "restart", "literal space", "$(not-a-shell)"]
`
	if err := os.WriteFile(path, []byte(raw), 0600); err != nil {
		t.Fatal(err)
	}
	return path, dataDir, database
}

func TestRunServiceCommandRestartsPanelWithExactConfiguredArgv(t *testing.T) {
	path, dataDir, database := writeCustomServiceConfig(t)
	var gotName string
	var gotArgs []string
	runner := func(ctx context.Context, name string, args ...string) ([]byte, []byte, error) {
		gotName = name
		gotArgs = append([]string(nil), args...)
		deadline, ok := ctx.Deadline()
		if !ok {
			t.Fatal("service command context has no deadline")
		}
		remaining := time.Until(deadline)
		if remaining < 29*time.Second || remaining > 31*time.Second {
			t.Fatalf("service command timeout = %v, want 30s", remaining)
		}
		return nil, nil, nil
	}
	if err := runServiceCommand([]string{"restart", "--target", "panel", "--config", path}, runner); err != nil {
		t.Fatal(err)
	}
	if gotName != "/opt/etc/init.d/S99telemt-panel" || !reflect.DeepEqual(gotArgs, []string{"restart", "literal space", "$(not-a-shell)"}) {
		t.Fatalf("runner argv = %q %#v", gotName, gotArgs)
	}
	for _, unexpected := range []string{dataDir, database} {
		if _, err := os.Lstat(unexpected); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("offline service command initialized %q: %v", unexpected, err)
		}
	}
}

func TestRunServiceCommandRejectsUnsupportedOperationsWithoutExecuting(t *testing.T) {
	path, _, _ := writeCustomServiceConfig(t)
	for _, args := range [][]string{
		nil,
		{"start", "--target", "panel", "--config", path},
		{"restart", "--target", "telemt", "--config", path},
		{"restart", "--target", "other", "--config", path},
		{"restart", "--target", "panel", "--config", path, "extra"},
	} {
		called := false
		err := runServiceCommand(args, func(context.Context, string, ...string) ([]byte, []byte, error) {
			called = true
			return nil, nil, nil
		})
		if err == nil {
			t.Fatalf("invalid args accepted: %#v", args)
		}
		if called {
			t.Fatalf("invalid args executed a command: %#v", args)
		}
	}
}

func TestRunServiceCommandRequiresCustomManager(t *testing.T) {
	path, _, _ := writeCustomServiceConfig(t)
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	raw = []byte(strings.Replace(string(raw), `service_manager = "custom"`, `service_manager = "systemd"`, 1))
	raw = raw[:strings.Index(string(raw), "[host.commands.telemt]")]
	if err := os.WriteFile(path, raw, 0600); err != nil {
		t.Fatal(err)
	}
	called := false
	err = runServiceCommand([]string{"restart", "--target", "panel", "--config", path}, func(context.Context, string, ...string) ([]byte, []byte, error) {
		called = true
		return nil, nil, nil
	})
	if err == nil || !strings.Contains(err.Error(), "custom") || called {
		t.Fatalf("non-custom result = %v, called=%v", err, called)
	}
}

func TestRunServiceCommandDoesNotExposeArgvOnFailure(t *testing.T) {
	path, _, _ := writeCustomServiceConfig(t)
	secret := "PRIVATE_RUNNER_DETAIL"
	err := runServiceCommand([]string{"restart", "--target", "panel", "--config", path}, func(context.Context, string, ...string) ([]byte, []byte, error) {
		return nil, []byte(secret), host.ErrPrivilegesUnavailable
	})
	if !errors.Is(err, host.ErrPrivilegesUnavailable) {
		t.Fatalf("error = %v", err)
	}
	for _, leaked := range []string{secret, "/opt/etc/init.d", "literal space", "$(not-a-shell)"} {
		if strings.Contains(err.Error(), leaked) {
			t.Fatalf("error leaked argv/stderr %q: %v", leaked, err)
		}
	}
}
