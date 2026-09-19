package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/amirotin/telemt_panel/internal/config"
	"github.com/amirotin/telemt_panel/internal/host"
	"github.com/amirotin/telemt_panel/internal/hub"
	"github.com/amirotin/telemt_panel/internal/store"
	"github.com/amirotin/telemt_panel/internal/telemt"
)

type customHintManager struct{ host.ServiceManager }

func (customHintManager) Kind() string { return "custom" }
func (customHintManager) Command(service, action string) []string {
	if service == "telemt" {
		return []string{"/opt/tools/control proxy", "--name", "route;literal", action}
	}
	if service == "telemt-panel" && action == "restart" {
		return []string{"/opt/tools/panel ctl", "restart"}
	}
	return nil
}

func TestCustomCommandsThroughServerAndSharedRunner(t *testing.T) {
	dir := t.TempDir()
	script, logPath := filepath.Join(dir, "control script"), filepath.Join(dir, "calls")
	t.Setenv("PANEL_TEST_COMMAND_LOG", logPath)
	if err := os.WriteFile(script, []byte("#!/bin/sh\nprintf '%s\\n' \"$@\" >> \"$PANEL_TEST_COMMAND_LOG\"\n"), 0700); err != nil {
		t.Fatal(err)
	}
	configFile := filepath.Join(dir, "panel.toml")
	input := fmt.Sprintf(`[auth]
username = "admin"
password_hash = %q
[telemt]
url = "http://127.0.0.1:1"
[privileges]
mode = "direct"
[host.commands.telemt]
start = [%q, "telemt", "start", "literal;not-shell"]
stop = [%q, "telemt", "stop"]
restart = [%q, "telemt", "restart"]
[host.commands.panel]
restart = [%q, "panel", "restart"]
`, testPasswordHash, script, script, script, script)
	if err := os.WriteFile(configFile, []byte(input), 0600); err != nil {
		t.Fatal(err)
	}
	cfg, err := config.Load(configFile)
	if err != nil {
		t.Fatal(err)
	}
	st, err := store.NewMemory("")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })
	tc := telemt.New("http://127.0.0.1:1", "")
	hb := hub.New(hub.Config{}, tc, st)
	t.Cleanup(hb.Close)
	s := New(cfg, tc, st, hb, "test")
	t.Cleanup(s.quotaResets.Close)
	t.Cleanup(s.limiter.Stop)
	t.Cleanup(s.subLimiter.Stop)
	t.Cleanup(s.geoip.Close)
	_, cookie := login(t, s.Handler(), "admin", testPassword)
	for _, action := range []string{"start", "stop", "restart"} {
		w := doRequest(t, s, cookie, "POST", "/api/telemt/"+action, nil, nil)
		if w.Code != 202 {
			t.Fatalf("%s: %d %s", action, w.Code, w.Body)
		}
	}
	// The update engine receives this same runner, including panel restarts.
	if _, err := s.runner.Run(context.Background(), host.Op{Kind: host.OpRestartService, Args: map[string]string{host.ArgService: cfg.Host.PanelService}}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.runner.Run(context.Background(), host.Op{Kind: host.OpStopService, Args: map[string]string{host.ArgService: cfg.Host.PanelService}}); err == nil {
		t.Fatal("panel stop accepted")
	}
	got, err := os.ReadFile(logPath)
	if err != nil || string(got) != "telemt\nstart\nliteral;not-shell\ntelemt\nstop\ntelemt\nrestart\npanel\nrestart\n" {
		t.Fatal("argv", string(got), err)
	}
	w := doRequest(t, s, cookie, "GET", "/api/telemt/service", nil, nil)
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"status":"unknown"`) || !strings.Contains(w.Body.String(), `"manager":"custom"`) {
		t.Fatal(w.Code, w.Body.String())
	}
}

func TestCustomFactoryPreservesSudoPolicyArgv(t *testing.T) {
	for _, policy := range []bool{false, true} {
		var got []string
		base := func(_ context.Context, name string, args ...string) ([]byte, []byte, error) {
			got = append([]string{name}, args...)
			return nil, nil, nil
		}
		run := host.NewSudoCmdRunner(base)
		if policy {
			run = host.NewSudoPolicyCmdRunner(base)
		}
		cfg := config.HostConfig{ServiceManager: host.KindCustom, TelemtService: "telemt", PanelService: "telemt-panel", Commands: host.CustomCommands{Panel: host.PanelCommands{Restart: []string{"/opt/control tool", "restart", "literal;argument"}}}}
		manager := configuredServiceManager(cfg, host.KindCustom, host.Probe{}, run)
		if err := manager.Restart(context.Background(), "telemt-panel"); err != nil {
			t.Fatal(err)
		}
		want := []string{"sudo", "-n", "--", "/opt/control tool", "restart", "literal;argument"}
		if policy {
			want = []string{"sudo", "-n", "-l", "--", "/opt/control tool", "restart", "literal;argument"}
		}
		if !reflect.DeepEqual(got, want) {
			t.Fatal("sudo argv", got, want)
		}
	}
}

func TestNoServiceManagerDoesNotOfferProseAsCommand(t *testing.T) {
	s, cookie, _, _ := newRestartTestServer(t)
	s.svcMgr = host.NewNone()
	s.privilegesMode = host.PrivilegesModeManual
	w := doRequest(t, s, cookie, "GET", "/api/telemt/service", nil, nil)
	var body struct {
		Manual map[string]string `json:"manual_commands"`
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &body) != nil {
		t.Fatal(w.Code, w.Body.String())
	}
	if len(body.Manual) != 0 {
		t.Fatal("non-executable instructions offered as commands", body.Manual)
	}
}

func TestCustomCommandsAppearInManualInstructions(t *testing.T) {
	s, cookie, _, runner := newRestartTestServer(t)
	s.cfg.Host.TelemtService = "telemt"
	s.cfg.Host.PanelService = "telemt-panel"
	s.svcMgr = customHintManager{host.NewSysvinit(func(context.Context, string, ...string) ([]byte, []byte, error) {
		t.Fatal("status or manual instructions executed a command")
		return nil, nil, nil
	})}
	s.privilegesMode = host.PrivilegesModeManual
	for _, path := range []string{"/api/host", "/api/telemt/service"} {
		w := doRequest(t, s, cookie, "GET", path, nil, nil)
		var body struct {
			Manual map[string]string `json:"manual_commands"`
			Status string            `json:"status"`
		}
		if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &body) != nil {
			t.Fatal(path, w.Code, w.Body.String())
		}
		key := "restart"
		if path == "/api/host" {
			key = "restart_telemt"
		}
		if got := body.Manual[key]; got != "'/opt/tools/control proxy' --name 'route;literal' restart" {
			t.Errorf("%s instruction = %q", path, got)
		}
		if path == "/api/host" && body.Manual["restart_panel"] != "'/opt/tools/panel ctl' restart" {
			t.Errorf("panel instruction: %q", body.Manual["restart_panel"])
		}
		if path == "/api/telemt/service" {
			if body.Status != "unknown" {
				t.Errorf("custom status = %q", body.Status)
			}
			if body.Manual["start"] != "'/opt/tools/control proxy' --name 'route;literal' start" {
				t.Error("missing custom start instruction")
			}
		}
	}
	w := doRequest(t, s, cookie, "GET", "/api/settings/tls/config", nil, nil)
	var tls struct {
		Manual string `json:"manual_restart_command"`
	}
	if w.Code != 200 || json.Unmarshal(w.Body.Bytes(), &tls) != nil || tls.Manual != "'/opt/tools/panel ctl' restart" {
		t.Fatal("TLS restart instruction", w.Code, w.Body.String())
	}
	if len(runner.CallsSnapshot()) != 0 {
		t.Fatal("manual command was executed")
	}
}
