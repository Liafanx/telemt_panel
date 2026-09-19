import type { ReactNode } from "react";
import { cn } from "../lib/cn";

// Page chrome only: content layouts, scrolling and state remain with each page.
export function PageHeader({
  title, description, titleMeta, meta, actions, back, compact = false,
}: {
  title: string;
  description?: ReactNode;
  titleMeta?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  back?: ReactNode;
  compact?: boolean;
}) {
  return (
    <header className={cn("page-header", compact && "page-header-compact")} data-testid="page-header">
      {back && <div className="page-header-back">{back}</div>}
      <div className="page-header-row">
        <div className="page-header-copy">
          <div className="page-header-title-row">
            <h1>{title}</h1>
            {titleMeta}
          </div>
          {!compact && description && <div className="page-header-description">{description}</div>}
        </div>
        {(meta || actions) && <div className="page-header-controls">
          {meta && <div className="page-header-meta">{meta}</div>}
          {actions && <div className="page-header-actions">{actions}</div>}
        </div>}
      </div>
    </header>
  );
}
