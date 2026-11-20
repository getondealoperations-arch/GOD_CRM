import { redirect } from "next/navigation";
import { currentUser, startSession, verifyPassword } from "@/lib/auth";
import { audit, one } from "@/lib/db";

async function login(f: FormData) {
  "use server";
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const u = await one("SELECT id, password_hash FROM users WHERE email=? AND active=1", [email]);
  if (!u || !verifyPassword(String(f.get("password") ?? ""), u.password_hash)) {
    await audit(null, "login_failed", "user", null, { email });
    redirect("/login?error=1");
  }
  await startSession(u.id);
  await audit(u.id, "login", "user", u.id);
  redirect("/");
}

export default async function Login({ searchParams }: PageProps<"/login">) {
  if (await currentUser()) redirect("/");
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={login} className="card w-full max-w-sm space-y-4 p-6">
        <div>
          <div className="text-lg font-bold text-indigo-700">GetOnDeal CRM</div>
          <p className="text-sm text-slate-500">Lead to Sales & Calling Operations</p>
        </div>
        {error && <p className="rounded bg-red-50 p-2 text-sm text-red-700">Invalid email or password.</p>}
        <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" required className="input" autoComplete="username" /></div>
        <div><label className="label" htmlFor="password">Password</label><input id="password" name="password" type="password" required className="input" autoComplete="current-password" /></div>
        <button className="btn w-full">Sign in</button>
      </form>
    </main>
  );
}
