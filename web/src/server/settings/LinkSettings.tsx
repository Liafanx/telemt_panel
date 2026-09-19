import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getLinkSettingsOptions,
  getLinkSettingsQueryKey,
  putLinkSettingsMutation,
} from "../../lib/api/generated/@tanstack/react-query.gen";
import { useStrings } from "../../i18n";
import { apiErrorMessage } from "../../people/apiError";
import { Button } from "../../ui/Button";
import { Toggle } from "../../ui/Toggle";
import { pushToast } from "../../ui/Toast";

export function LinkSettings() {
  const s = useStrings(),
    t = s.linkAddress,
    cache = useQueryClient();
  const query = useQuery(getLinkSettingsOptions());
  const save = useMutation({
    ...putLinkSettingsMutation(),
    retry: false,
    onSuccess: (data) => {
      cache.setQueryData(getLinkSettingsQueryKey(), data);
      pushToast(t.saved, "ok");
    },
  });
  return (
    <section className="overflow-hidden rounded-xl bg-surface" data-testid="settings-links">
      <header className="border-b border-border px-4 py-3.5">
        <span className="text-xs font-semibold text-text-muted">{t.scope}</span>
        <h2 className="mt-1 text-base font-bold text-text">{t.title}</h2>
      </header>
      <div className="space-y-3 p-4">
        <div className="flex min-h-11 items-center justify-between gap-4">
          <span className="text-sm font-semibold text-text">{t.allow}</span>
          <Toggle
            aria-label={t.allow}
            checked={query.data?.allow_address_override === true}
            disabled={!query.data || query.isError || save.isPending}
            onChange={(allow_address_override) => save.mutate({ body: { allow_address_override } })}
            className="before:absolute before:-inset-y-2.5 before:inset-x-0"
          />
        </div>
        <p className="text-sm leading-relaxed text-text-muted">{t.note}</p>
        {query.error && (
          <>
            <p role="alert" className="text-sm text-error">
              {apiErrorMessage(query.error, s)}
            </p>
            <Button variant="secondary" onClick={() => void query.refetch()}>
              {s.common.retry}
            </Button>
          </>
        )}
        {save.error && (
          <p role="alert" className="text-sm text-error">
            {apiErrorMessage(save.error, s)}
          </p>
        )}
      </div>
    </section>
  );
}
