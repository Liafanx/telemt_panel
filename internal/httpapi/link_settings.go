package httpapi

import (
	"net/http"
	"strconv"

	"github.com/amirotin/telemt_panel/internal/auth"
)

const linkAddressOverrideKey = "links.allow_address_override"

type linkSettings struct {
	AllowAddressOverride bool `json:"allow_address_override"`
}

func (s *Server) handleGetLinkSettings(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	value, _, err := s.st.GetSetting(linkAddressOverrideKey)
	if err != nil {
		auth.WriteError(w, http.StatusInternalServerError, "internal_error", "could not read link settings")
		return
	}
	writeJSON(w, http.StatusOK, linkSettings{AllowAddressOverride: value == "true"})
}

func (s *Server) handlePutLinkSettings(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	var body struct {
		AllowAddressOverride *bool `json:"allow_address_override"`
	}
	if err := decodeJSONBody(w, r, &body, jsonBodyOptions{MaxBytes: 1024, RejectUnknown: true}); err != nil || body.AllowAddressOverride == nil {
		auth.WriteError(w, http.StatusBadRequest, "bad_request", "invalid link settings")
		return
	}
	if err := s.st.SetSetting(linkAddressOverrideKey, strconv.FormatBool(*body.AllowAddressOverride)); err != nil {
		auth.WriteError(w, http.StatusInternalServerError, "internal_error", "could not save link settings")
		return
	}
	s.appendAudit(r, "links.settings_change", "panel", "")
	writeJSON(w, http.StatusOK, linkSettings{AllowAddressOverride: *body.AllowAddressOverride})
}
