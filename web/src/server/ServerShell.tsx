import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useStrings } from "../i18n";
import { IconChevronLeft } from "../ui/icons";
import { PageHeader } from "../ui/PageHeader";

// Shared page chrome; each subpage retains its own content layout.
export function ServerShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const s = useStrings();
  return (
    <div className="min-w-0">
      <PageHeader title={title} back={<Link to="/server" aria-label={s.server.back}><IconChevronLeft aria-hidden="true" />{s.server.title}</Link>} />
      <div className="flex min-w-0 flex-col gap-2.5">{children}</div>
    </div>
  );
}
