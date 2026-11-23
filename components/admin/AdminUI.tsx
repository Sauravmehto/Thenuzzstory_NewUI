import type { ReactNode } from "react";

/*
 * Small presentational pieces shared by the admin screens, so every page has
 * the same header, summary numbers, tabs, notes and empty states.
 * No state of their own: the screen owns the data.
 */

export function PageHeader({
  id,
  title,
  description,
  actions,
  eyebrow,
}: {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="admin-toolbar admin-page-head">
      <div className="admin-page-head__text">
        {eyebrow && <p className="admin-crumbs">{eyebrow}</p>}
        <h1 id={id}>{title}</h1>
        {description && <p className="admin-page-head__desc">{description}</p>}
      </div>
      {actions && <div className="admin-toolbar__actions">{actions}</div>}
    </div>
  );
}

export type Tone = "blue" | "amber" | "green" | "grey" | "red" | "violet";

export interface Stat<K extends string> {
  key: K;
  label: string;
  value: number | string;
  hint?: string;
  tone?: Tone;
}

/** Summary numbers. With `onSelect`, each card is a button that filters the list below. */
export function StatCards<K extends string>({
  stats,
  selected,
  onSelect,
  label,
}: {
  stats: Stat<K>[];
  selected?: K;
  onSelect?: (key: K) => void;
  label: string;
}) {
  return (
    <ul className="admin-stats" aria-label={label}>
      {stats.map((s) => {
        const body = (
          <>
            <span className="admin-stat__value">{s.value}</span>
            <span className="admin-stat__label">{s.label}</span>
            {s.hint && <span className="admin-stat__hint">{s.hint}</span>}
          </>
        );
        return (
          <li key={s.key} className="admin-stat" data-tone={s.tone ?? "blue"}>
            {onSelect ? (
              <button type="button" className="admin-stat__btn" aria-pressed={selected === s.key} onClick={() => onSelect(s.key)}>
                {body}
              </button>
            ) : (
              <div className="admin-stat__btn">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Status filter chips with counts (same pattern as the grooming tabs). */
export function StatusTabs<K extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: { key: K; label: string; count?: number }[];
  value: K;
  onChange: (key: K) => void;
  label: string;
}) {
  return (
    <div className="admin-tabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.key} type="button" role="tab" aria-selected={value === t.key} className="admin-tab" onClick={() => onChange(t.key)}>
          {t.label}
          {t.count !== undefined && <span className="admin-tab__count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** A short plain-language note. Technical detail goes in `details`, folded away. */
export function Callout({
  tone = "info",
  children,
  details,
  detailsLabel = "Details",
}: {
  tone?: "info" | "warn" | "ok";
  children: ReactNode;
  details?: ReactNode;
  detailsLabel?: string;
}) {
  return (
    <div className="admin-callout" data-tone={tone}>
      <span className="admin-callout__icon" aria-hidden="true">
        {tone === "warn" ? "⚠️" : tone === "ok" ? "✅" : "ℹ️"}
      </span>
      <div className="admin-callout__body">
        <div>{children}</div>
        {details && (
          <details className="admin-callout__details">
            <summary>{detailsLabel}</summary>
            <div>{details}</div>
          </details>
        )}
      </div>
    </div>
  );
}

export function EmptyState({
  icon = "🐾",
  title,
  children,
  action,
  role,
}: {
  icon?: string;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  role?: "alert" | "status";
}) {
  return (
    <div className="admin-empty admin-empty--rich" role={role}>
      <span className="admin-empty__icon" aria-hidden="true">
        {icon}
      </span>
      <p className="admin-empty__title">{title}</p>
      {children && <div className="admin-empty__text">{children}</div>}
      {action && <div className="admin-empty__action">{action}</div>}
    </div>
  );
}
