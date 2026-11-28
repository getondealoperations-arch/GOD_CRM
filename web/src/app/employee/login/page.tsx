import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, EMPLOYEE_PORTAL_ROLES, startSession, verifyPassword, type Role } from "@/lib/auth";
import { audit, one } from "@/lib/db";

async function employeeLogin(f: FormData) {
  "use server";
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const u = await one<{ id: number; password_hash: string; role: Role }>("SELECT id, password_hash, role FROM users WHERE email=? AND active=1", [email]);
  if (!u || !verifyPassword(String(f.get("password") ?? ""), u.password_hash)) {
    await audit(null, "login_failed", "user", null, { email, portal: "employee" });
    redirect("/employee/login?error=1");
  }
  // Right password, wrong door: managers and admins use the main sign-in. No session is started.
  if (!EMPLOYEE_PORTAL_ROLES.includes(u.role)) redirect("/employee/login?error=portal");
  await startSession(u.id);
  await audit(u.id, "login", "user", u.id, { portal: "employee" });
  redirect("/work");
}

export default async function EmployeeLogin({ searchParams }: PageProps<"/employee/login">) {
  if (await currentUser()) redirect("/work");
  const { error } = await searchParams;
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-ink p-12 lg:flex">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-xl bg-white p-1.5"><Image src="/logo.png" alt="" width={36} height={36} priority /></span>
          <span className="font-display text-xl font-semibold tracking-tight text-white">GetOnDeal</span>
        </div>
        <div>
          <h1 className="max-w-md font-display text-5xl font-semibold leading-[1.05] tracking-tight text-white">Your leads, your calls, your day.</h1>
          <p className="mt-4 max-w-sm text-base leading-relaxed text-[#a9b7d9]">See who to call next, finish your follow-ups and watch your targets fill up.</p>
        </div>
        <ul aria-hidden="true" className="space-y-3 text-sm text-[#a9b7d9]">
          {["New leads assigned to you", "Follow-ups due today", "Calls and conversions against target"].map((t) => (
            <li key={t} className="flex items-center gap-3"><span className="size-2 rounded-full bg-brand" />{t}</li>
          ))}
        </ul>
      </section>
      <section className="flex items-center justify-center p-6">
        <form action={employeeLogin} className="w-full max-w-sm space-y-5">
          <div>
            <div className="flex items-center gap-2.5 lg:hidden">
              <Image src="/logo.png" alt="" width={40} height={40} priority />
              <span className="font-display text-xl font-semibold tracking-tight text-slate-900">GetOnDeal CRM</span>
            </div>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 max-lg:mt-3">Employee sign in</h2>
            <p className="mt-1 text-sm text-slate-500">Use the email and password your manager gave you.</p>
          </div>
          {error === "portal"
            ? <p role="alert" className="rounded-md border border-amber-100 bg-amber-50 p-2.5 text-sm text-amber-800">This sign-in is for employees. Managers and admins sign in on the <Link href="/login" className="font-medium underline">main sign-in page</Link>.</p>
            : error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">Invalid email or password. Check both and try again.</p>}
          <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" required autoFocus className="input py-2" autoComplete="username" /></div>
          <div><label className="label" htmlFor="password">Password</label><input id="password" name="password" type="password" required className="input py-2" autoComplete="current-password" /></div>
          <button className="btn w-full py-2">Sign in</button>
          <p className="text-center text-sm text-slate-500">Manager or admin? <Link href="/login" className="link">Sign in here</Link></p>
        </form>
      </section>
    </main>
  );
}
