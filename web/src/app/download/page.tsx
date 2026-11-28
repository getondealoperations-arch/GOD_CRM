import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = { title: "Get the app | GetOnDeal CRM" };

const STEPS = [
  "Tap Download for Android.",
  "When the file has downloaded, tap Open. If your phone asks, allow your browser to install apps, just this once.",
  "Tap Install, then Open.",
  "Sign in with the email and password you use for the CRM.",
];

export default function Download() {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-ink p-12 lg:flex">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-xl bg-white p-1.5"><Image src="/logo.png" alt="" width={36} height={36} priority /></span>
          <span className="font-display text-xl font-semibold tracking-tight text-white">GetOnDeal</span>
        </div>
        <div>
          <h1 className="max-w-md font-display text-5xl font-semibold leading-[1.05] tracking-tight text-white">Your leads and calls, one tap away.</h1>
          <p className="mt-4 max-w-sm text-base leading-relaxed text-[#a9b7d9]">Install the GetOnDeal CRM on your phone. It opens full screen, like any other app.</p>
        </div>
        <p className="text-sm text-[#a9b7d9]">For the Get On Deal team</p>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div>
            <div className="flex items-center gap-2.5 lg:hidden">
              <Image src="/logo.png" alt="" width={40} height={40} priority />
              <span className="font-display text-xl font-semibold tracking-tight text-slate-900">GetOnDeal CRM</span>
            </div>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 max-lg:mt-3">Get the app</h2>
            <p className="mt-1 text-sm text-slate-500">Download it here. You do not need the Play Store.</p>
          </div>

          <div className="space-y-2">
            <a href="/downloads/getondeal-crm.apk" download="getondeal-crm.apk" className="btn w-full py-3 text-base">Download for Android</a>
            <p className="text-center text-xs text-slate-500">Version 1.0, 1.4 MB, Android 7 or newer</p>
          </div>

          <ol className="space-y-3 text-sm text-slate-700">
            {STEPS.map((t, i) => (
              <li key={t} className="flex gap-3">
                <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">{i + 1}</span>
                <span className="pt-0.5">{t}</span>
              </li>
            ))}
          </ol>

          <p className="rounded-md border border-amber-100 bg-amber-50 p-2.5 text-xs leading-relaxed text-amber-800">
            Your phone may say this type of file can be harmful. That message appears for every app that does not come from the Play Store. This one is from Get On Deal.
          </p>

          <div className="space-y-1 border-t border-slate-200 pt-4 text-sm">
            <h3 className="font-medium text-slate-900">On an iPhone?</h3>
            <p className="text-slate-600">Open this page in Safari, tap the Share button, then tap Add to Home Screen. You get the same icon and the same full-screen app.</p>
          </div>

          <p className="text-center text-sm text-slate-500"><Link href="/employee/login" className="link">Back to employee sign in</Link></p>
        </div>
      </section>
    </main>
  );
}
