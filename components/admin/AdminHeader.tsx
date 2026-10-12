"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const LINKS = [
  { href: "/admin", label: "Products" },
  { href: "/admin/import", label: "Import" },
  { href: "/admin/preview/shop", label: "Shop preview" },
];

export default function AdminHeader() {
  const pathname = usePathname();
  const [leaving, setLeaving] = useState(false);

  const logout = async () => {
    setLeaving(true);
    await fetch("/api/admin/session", { method: "DELETE", credentials: "same-origin" }).catch(() => undefined);
    window.location.assign("/admin/login");
  };

  return (
    <header className="admin-header">
      <div className="admin-header__row">
        <Link href="/admin" className="admin-header__brand">
          The Nuzz Story <span>admin</span>
        </Link>
        <nav aria-label="Admin">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="admin-header__link"
              aria-current={(l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href)) ? "page" : undefined}
            >
              {l.label}
            </Link>
          ))}
          <Link href="/shop" className="admin-header__link">
            Live shop ↗
          </Link>
          <button type="button" className="admin-btn admin-btn--ghost" onClick={logout} disabled={leaving}>
            {leaving ? "Logging out…" : "Log out"}
          </button>
        </nav>
      </div>
      <p className="admin-header__note">
        Changes save to <code>data/catalog.json</code> on this computer. Commit and redeploy to update the live site.
      </p>
    </header>
  );
}
