package main

import (
	"context"
	"errors"
	"flag"
	"io"
	"time"

	"github.com/amirotin/telemt_panel/internal/config"
	"github.com/amirotin/telemt_panel/internal/host"
)

const serviceCommandTimeout = 30 * time.Second

func runServiceCommand(args []string, runner host.CmdRunner) error {
	if len(args) == 0 || args[0] != "restart" {
		return serviceCommandUsage()
	}
	flags := flag.NewFlagSet("service restart", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	target := flags.String("target", "", "service target")
	configPath := flags.String("config", "config.toml", "panel config path")
	if err := flags.Parse(args[1:]); err != nil || flags.NArg() != 0 || *target != "panel" {
		return serviceCommandUsage()
	}
	cfg, err := config.Load(*configPath)
	if err != nil {
		return err
	}
	if cfg.Host.ServiceManager != host.KindCustom {
		return errors.New("service restart requires host.service_manager = custom")
	}
	manager := host.NewCustom(cfg.Host.TelemtService, cfg.Host.PanelService, cfg.Host.Commands, runner)
	ctx, cancel := context.WithTimeout(context.Background(), serviceCommandTimeout)
	defer cancel()
	return manager.Restart(ctx, cfg.Host.PanelService)
}

func serviceCommandUsage() error {
	return errors.New("usage: telemt-panel service restart --target panel --config config.toml")
}
