import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser, hashPassword } from "@/lib/auth";
import { audit, notify, one, q } from "@/lib/db";
import { MAX_PENDING, listRequests, saveRequests } from "@/lib/access-requests";
import { normMobile, validEmail } from "@/lib/leads";

const ERRORS: Record<string, string> = {
  details: "Enter your name and a valid email address.",
  short: "Use at least 8 characters for the password.",
  match: "The two passwords do not match.",
  full: "Too many requests are waiting for approval. Ask your manager to create your account instead.",
};

async function requestAccess(f: FormData) {
  "use server";
  // Spam trap: real people never see or fill this field. Bots do, and get a fake success.
  if (String(f.get("company") ?? "")) redirect("/employee/login?requested=1");

  const name = String(f.get("name") ?? "").trim().slice(0, 120);
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  const phone = normMobile(String(f.get("phone") ?? "")) || null;
  const password = String(f.get("password") ?? "");
  if (!name || !email || !validEmail(email)) redirect("/employee/signup?error=details");
  if (password.length < 8) redirect("/employee/signup?error=short");
  if (password !== String(f.get("confirm") ?? "")) redirect("/employee/signup?error=match");

  // The same message is shown whether or not the email is already known, so this page cannot be used to find out who has an account.
  const exists = await one("SELECT id FROM users WHERE email=?", [email]);
  const list = await listRequests();
  if (!exists && !list.some((r) => r.email === email)) {
    if (list.length >= MAX_PENDING) redirect("/employee/signup?error=full");
    await saveRequests([...list, { name, email, phone, password_hash: hashPassword(password), requested_at: new Date().toISOString() }]);
    await audit(null, "access_request", "user", null, { name, email });
    const admins = await q<{ id: number }>("SELECT id FROM users WHERE active=1 AND role IN ('super_admin','admin')");
    for (const a of admins) await notify(a.id, `New access request: ${name}`, "/team");
  }
  redirect("/employee/login?requested=1");
}

export default async function EmployeeSignup({ searchParams }: PageProps<"/employee/signup">) {
  if (await currentUser()) redirect("/work");
  const { error } = await searchParams;
  const message = typeof error === "string" ? ERRORS[error] : undefined;
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-ink p-12 lg:flex">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-xl bg-white p-1.5"><Image src="/logo.png" alt="" width={36} height={36} priority /></span>
          <span className="font-display text-xl font-semibold tracking-tight text-white">GetOnDeal</span>
        </div>
        <div>
          <h1 className="max-w-md font-display text-5xl font-semibold leading-[1.05] tracking-tight text-white">Join the team on GetOnDeal.</h1>
          <p className="mt-4 max-w-sm text-base leading-relaxed text-[#a9b7d9]">Send your details. An admin checks the request, sets your role and team, and you can sign in once it is approved.</p>
        </div>
        <ol aria-hidden="true" className="space-y-3 text-sm text-[#a9b7d9]">
          {["You request access", "An admin approves it", "You sign in and start calling"].map((t, i) => (
            <li key={t} className="flex items-center gap-3"><span className="grid size-6 place-items-center rounded-full bg-brand text-xs font-semibold text-white">{i + 1}</span>{t}</li>
          ))}
        </ol>
      </section>
      <section className="flex items-center justify-center p-6">
        <form action={requestAccess} className="w-full max-w-sm space-y-4">
          <div>
            <div className="flex items-center gap-2.5 lg:hidden">
              <Image src="/logo.png" alt="" width={40} height={40} priority />
              <span className="font-display text-xl font-semibold tracking-tight text-slate-900">GetOnDeal CRM</span>
            </div>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 max-lg:mt-3">Request access</h2>
            <p className="mt-1 text-sm text-slate-500">You will not be able to sign in until an admin approves your request.</p>
          </div>
          {message && <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">{message}</p>}
          <div><label className="label" htmlFor="name">Full name</label><input id="name" name="name" required maxLength={120} autoFocus className="input py-2" autoComplete="name" /></div>
          <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" required className="input py-2" autoComplete="username" /></div>
          <div><label className="label" htmlFor="phone">Mobile number (optional)</label><input id="phone" name="phone" type="tel" className="input py-2" autoComplete="tel" /></div>
          <div><label className="label" htmlFor="password">Password (at least 8 characters)</label><input id="password" name="password" type="password" required minLength={8} className="input py-2" autoComplete="new-password" /></div>
          <div><label className="label" htmlFor="confirm">Confirm password</label><input id="confirm" name="confirm" type="password" required minLength={8} className="input py-2" autoComplete="new-password" /></div>
          {/* Spam trap, hidden from people and screen readers. */}
          <div aria-hidden="true" className="absolute -left-[9999px]"><label>Company<input name="company" tabIndex={-1} autoComplete="off" /></label></div>
          <button className="btn w-full py-2">Send request</button>
          <p className="text-center text-sm text-slate-500">Already approved? <Link href="/employee/login" className="link">Employee sign in</Link></p>
        </form>
      </section>
    </main>
  );
}
