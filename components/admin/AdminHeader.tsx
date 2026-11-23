"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useDialog } from "@/lib/hooks/useDialog";

type Badge = "orders" | "grooming";
interface NavItem {
  href: string;
  label: string;
  icon: string;
  badge?: Badge;
  /** Extra paths that count as this page (e.g. a booking detail). */
  match?: RegExp;
}

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Shop",
    items: [
      { href: "/admin", label: "Products", icon: "📦", match: /^\/admin\/products\// },
      { href: "/admin/orders", label: "Orders", icon: "🧾", badge: "orders" },
      { href: "/admin/import", label: "Import from photos", icon: "📥" },
      { href: "/admin/preview/shop", label: "Shop preview", icon: "👀" },
    ],
  },
  {
    title: "Grooming",
    items: [
      { href: "/admin/grooming", label: "Appointments", icon: "📅", badge: "grooming", match: /^\/admin\/grooming\/GR-/ },
      { href: "/admin/grooming/availability", label: "Hours & slots", icon: "🕘" },
      { href: "/admin/grooming/pricing", label: "Prices & services", icon: "💰" },
      { href: "/admin/grooming/videos", label: "Videos", icon: "🎬" },
      { href: "/admin/grooming/gallery", label: "Gallery", icon: "🖼️" },
      { href: "/admin/grooming/testimonials", label: "Reviews", icon: "⭐" },
    ],
  },
];

const ALL = GROUPS.flatMap((g) => g.items);

function isCurrent(item: NavItem, pathname: string) {
  if (item.match?.test(pathname)) return true;
  // Exact match for section roots, so "/admin" doesn't light up on every page.
  if (item.href === "/admin" || item.href === "/admin/grooming") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

/** Pending counts for the menu badges. Best effort: a failed request just hides the badge. */
function useBadges(pathname: string) {
  const [counts, setCounts] = useState<Partial<Record<Badge, number>>>({});
  useEffect(() => {
    let alive = true;
    const get = async (url: string) => {
      try {
        const res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
        return res.ok ? ((await res.json()) as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    };
    void Promise.all([get("/api/admin/orders"), get("/api/admin/grooming/bookings")]).then(([o, g]) => {
      if (!alive) return;
      const pending = (list: unknown) =>
        Array.isArray(list) ? list.filter((x) => (x as { status?: string }).status === "pending_confirmation").length : undefined;
      setCounts({ orders: pending(o?.orders), grooming: pending(g?.bookings) });
    });
    return () => {
      alive = false;
    };
    // Re-count when the admin moves between pages (after confirming a booking, say).
  }, [pathname]);
  return counts;
}

export default function AdminHeader() {
  const pathname = usePathname();
  const [leaving, setLeaving] = useState(false);
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const counts = useBadges(pathname);
  const current = ALL.find((i) => isCurrent(i, pathname));

  useDialog(drawerRef, open, () => setOpen(false));
  useEffect(() => setOpen(false), [pathname]);

  const logout = async () => {
    setLeaving(true);
    await fetch("/api/admin/session", { method: "DELETE", credentials: "same-origin" }).catch(() => undefined);
    window.location.assign("/admin/login");
  };

  return (
    <header className="admin-header" data-open={open || undefined}>
      <div className="admin-topbar">
        <button
          type="button"
          className="admin-topbar__menu"
          aria-expanded={open}
          aria-controls="admin-sidebar"
          onClick={() => setOpen(true)}
        >
          <span aria-hidden="true">☰</span>
          <span className="visually-hidden">Open menu</span>
        </button>
        <Link href="/admin" className="admin-topbar__brand">
          <img src="/assets/brand/nuzzstorylogo-removebg.png" alt="The Nuzz Story" width={96} height={32} />
        </Link>
        <span className="admin-topbar__page">{current?.label ?? "Admin"}</span>
      </div>

      <div className="admin-sidebar__scrim" aria-hidden="true" onClick={() => setOpen(false)} />

      <div
        ref={drawerRef}
        id="admin-sidebar"
        className="admin-sidebar"
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        aria-label={open ? "Admin menu" : undefined}
      >
        <div className="admin-sidebar__head">
          <Link href="/admin" className="admin-sidebar__brand">
            <img src="/assets/brand/nuzzstorylogo-removebg.png" alt="The Nuzz Story" width={132} height={44} />
            <span className="admin-sidebar__tag">Admin</span>
          </Link>
          <button type="button" className="admin-sidebar__close" onClick={() => setOpen(false)}>
            <span aria-hidden="true">✕</span>
            <span className="visually-hidden">Close menu</span>
          </button>
        </div>

        <nav aria-label="Admin" className="admin-sidebar__nav">
          {GROUPS.map((g) => (
            <div key={g.title} className="admin-sidebar__group">
              <p className="admin-sidebar__title">{g.title}</p>
              <ul>
                {g.items.map((item) => {
                  const n = item.badge ? counts[item.badge] : undefined;
                  return (
                    <li key={item.href}>
                      <Link href={item.href} className="admin-header__link" aria-current={isCurrent(item, pathname) ? "page" : undefined}>
                        <span className="admin-header__icon" aria-hidden="true">
                          {item.icon}
                        </span>
                        <span className="admin-header__label">{item.label}</span>
                        {!!n && (
                          <span className="admin-header__badge">
                            {n}
                            <span className="visually-hidden"> pending</span>
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="admin-sidebar__foot">
          <Link href="/shop" className="admin-header__link admin-header__link--quiet">
            <span className="admin-header__icon" aria-hidden="true">
              🛍️
            </span>
            <span className="admin-header__label">View live shop ↗</span>
          </Link>
          <Link href="/grooming" className="admin-header__link admin-header__link--quiet">
            <span className="admin-header__icon" aria-hidden="true">
              ✂️
            </span>
            <span className="admin-header__label">View grooming page ↗</span>
          </Link>
          <button type="button" className="admin-btn admin-btn--ghost admin-sidebar__logout" onClick={logout} disabled={leaving}>
            {leaving ? "Logging out…" : "Log out"}
          </button>
        </div>
      </div>
    </header>
  );
}
