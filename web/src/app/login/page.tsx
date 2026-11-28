import Image from "next/image";
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
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel: the funnel is the product, so it is the one illustration. */}
      <section className="relative hidden flex-col justify-between overflow-hidden bg-ink p-12 lg:flex">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-xl bg-white p-1.5"><Image src="/logo.png" alt="" width={36} height={36} priority /></span>
          <span className="font-display text-xl font-semibold tracking-tight text-white">GetOnDeal</span>
        </div>
        <div>
          <h1 className="max-w-md font-display text-5xl font-semibold leading-[1.05] tracking-tight text-white">Every lead, from first call to payment.</h1>
          <p className="mt-4 max-w-sm text-base leading-relaxed text-[#a9b7d9]">Assign leads, run the calling queue, follow up on time and see what each campaign earns.</p>
        </div>
        <div aria-hidden="true" className="space-y-2">
          {[100, 78, 54, 33, 18].map((w, i) => (
            <div key={w} className="h-2.5 rounded-full" style={{ width: `${w}%`, background: "var(--color-brand)", opacity: 1 - i * 0.17 }} />
          ))}
        </div>
      </section>
      <section className="flex items-center justify-center p-6">
        <form action={login} className="w-full max-w-sm space-y-5">
          <div>
            <div className="flex items-center gap-2.5 lg:hidden">
              <Image src="/logo.png" alt="" width={40} height={40} priority />
              <span className="font-display text-xl font-semibold tracking-tight text-slate-900">GetOnDeal CRM</span>
            </div>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 max-lg:mt-3">Sign in</h2>
            <p className="mt-1 text-sm text-slate-500">Use the email and password your admin gave you.</p>
          </div>
          {error && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">Invalid email or password. Check both and try again.</p>}
          <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" required autoFocus className="input py-2" autoComplete="username" /></div>
          <div><label className="label" htmlFor="password">Password</label><input id="password" name="password" type="password" required className="input py-2" autoComplete="current-password" /></div>
          <button className="btn w-full py-2">Sign in</button>
        </form>
      </section>
    </main>
  );
}
