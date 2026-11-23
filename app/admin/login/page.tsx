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
        <img className="admin-login__logo" src="/assets/brand/nuzzstorylogo-removebg.png" alt="The Nuzz Story" width={180} height={60} />
        <h1>Admin is off</h1>
        <p className="admin-login__sub">{availability.reason}</p>
        <ol className="admin-login__steps">
          <li>
            Create a file called <code>.env.local</code> in the project folder (you can copy <code>.env.example</code>).
          </li>
          <li>
            Add the line <code>ADMIN_PASSWORD=your-password</code> (at least 8 characters).
          </li>
          <li>
            Stop and restart <code>npm run dev</code>, then reload this page.
          </li>
        </ol>
      </main>
    );
  }

  if (verifySessionToken((await cookies()).get(ADMIN_COOKIE)?.value)) redirect(next);
  return <AdminLogin next={next} />;
}
