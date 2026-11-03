import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import AdminLogin from "@/components/admin/AdminLogin";
import { ADMIN_COOKIE, adminAvailability, verifySessionToken } from "@/lib/server/admin-auth";

export const dynamic = "force-dynamic";

const safeNext = (next: unknown) =>
  typeof next === "string" && next.startsWith("/admin") && !next.startsWith("//") ? next : "/admin";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const availability = adminAvailability();
  const next = safeNext((await searchParams).next);

  if (!availability.enabled) {
    // In production the admin simply doesn't exist.
    if (process.env.NODE_ENV === "production") notFound();
    return (
      <main className="admin-login">
        <h1>Admin is off</h1>
        <p>{availability.reason}</p>
        <p>
          Copy <code>.env.example</code> to <code>.env.local</code>, set <code>ADMIN_PASSWORD</code>, then restart{" "}
          <code>npm run dev</code>.
        </p>
      </main>
    );
  }

  if (verifySessionToken((await cookies()).get(ADMIN_COOKIE)?.value)) redirect(next);
  return <AdminLogin next={next} />;
}
