import Link from "next/link";

export default function Forbidden() {
  return (
    <main className="mx-auto max-w-md space-y-3 p-8 text-center">
      <h1 className="h1">Not permitted</h1>
      <p className="text-sm text-slate-600">Your role does not have access to this page or action. Ask an admin if you need it (Settings → Roles & permissions).</p>
      <Link href="/" className="btn">Back to dashboard</Link>
    </main>
  );
}
