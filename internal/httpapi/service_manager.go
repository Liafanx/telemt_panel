package httpapi

import (
	"github.com/amirotin/telemt_panel/internal/config"
	"github.com/amirotin/telemt_panel/internal/host"
)

func configuredServiceManager(cfg config.HostConfig, kind string, probe host.Probe, run host.CmdRunner) host.ServiceManager {
	if kind == host.KindCustom {
		return host.NewCustom(cfg.TelemtService, cfg.PanelService, cfg.Commands, run)
	}
	return host.NewServiceManager(kind, probe, run)
}
