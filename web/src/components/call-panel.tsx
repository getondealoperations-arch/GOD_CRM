"use client";
import { useEffect, useState } from "react";
import { clickToCallAction, logCall } from "@/app/(app)/actions";
import type { Row } from "@/lib/db";

const DISPOSITIONS = [
  "Connected", "Not Answered", "Busy", "Switched Off", "Invalid Number", "Call Back Requested",
  "Interested", "Not Interested", "Follow-up Required", "Converted", "Wrong Number",
];
const LOSTY = ["Not Interested", "Wrong Number", "Invalid Number"];
const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);

/** Minimal-click call logging: tap call → tap disposition → (optional) follow-up preset → Save. */
export function CallPanel({ lead, stages, next, telephony }: { lead: Row; stages: Row[]; next?: string; telephony?: boolean }) {
  const [start, setStart] = useState<number | null>(null);
  const [callId, setCallId] = useState<number | null>(null);
  const [telMsg, setTelMsg] = useState("");
  // TRAI: commercial calls only 09:00–21:00 — warn outside that window
  const [offHours] = useState(() => { const h = new Date().getHours(); return h < 9 || h >= 21; });
  const [elapsed, setElapsed] = useState(0);
  const dial = async () => {
    setTelMsg("Ringing your phone…");
    const r = await clickToCallAction(lead.id);
    if (r.error) { setTelMsg(r.error); return; }
    setCallId(r.callId ?? null); setElapsed(0);
    setStart(Date.now());
    setTelMsg("Answer your phone — the customer is dialled next. Duration & recording are saved automatically.");
  };
  const [dispo, setDispo] = useState("");
  const [fu, setFu] = useState("");
  useEffect(() => {
    if (!start) return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(t);
  }, [start]);
  const presets: [string, () => Date][] = [
    ["+1 hour", () => new Date(Date.now() + 36e5)],
    ["Tomorrow 11am", () => { const d = new Date(Date.now() + 864e5); d.setHours(11, 0, 0, 0); return d; }],
    ["+3 days", () => { const d = new Date(Date.now() + 3 * 864e5); d.setHours(11, 0, 0, 0); return d; }],
    ["Next week", () => { const d = new Date(Date.now() + 7 * 864e5); d.setHours(11, 0, 0, 0); return d; }],
  ];

  return (
    <form action={logCall} className="space-y-3" onSubmit={() => setStart(null)}>
      <input type="hidden" name="lead_id" value={lead.id} />
      {next && <input type="hidden" name="next" value={next} />}
      <input type="hidden" name="duration_sec" value={elapsed} />
      {callId && <input type="hidden" name="call_id" value={callId} />}
      <div className="flex flex-wrap items-center gap-2">
        {telephony
          ? <button type="button" onClick={dial} disabled={!!start} className="btn bg-green-600 hover:bg-green-500">📞 Call {lead.mobile}</button>
          : <a href={`tel:${lead.mobile}`} onClick={() => { setStart(Date.now()); setElapsed(0); }} className="btn bg-green-600 hover:bg-green-500">📞 Call {lead.mobile}</a>}
        {lead.alt_mobile && <a href={`tel:${lead.alt_mobile}`} className="btn-ghost">Alt: {lead.alt_mobile}</a>}
        <a href={`https://wa.me/91${lead.mobile}`} target="_blank" rel="noreferrer" className="btn-ghost">WhatsApp</a>
        <span className="text-sm tabular-nums text-slate-600" aria-live="polite">
          {start ? `⏱ ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}` : elapsed ? `Duration ${Math.round(elapsed / 60)} min` : ""}
        </span>
        {start && <button type="button" className="btn-ghost" onClick={() => setStart(null)}>End call</button>}
      </div>
      {telMsg && <p className="text-xs text-slate-600" aria-live="polite">{telMsg}</p>}
      {lead.dnd ? <p className="rounded bg-amber-50 p-2 text-xs text-amber-800">⚠ Customer is on Do-Not-Disturb — do not call unless they asked for it.</p> : null}
      {offHours ? <p className="rounded bg-amber-50 p-2 text-xs text-amber-800">⚠ Outside 9 am – 9 pm: telemarketing rules (TRAI) restrict promotional calls now.</p> : null}

      <fieldset>
        <legend className="label">Disposition *</legend>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
          {DISPOSITIONS.map((d) => (
            <label key={d} className={`cursor-pointer rounded-lg border px-2 py-1.5 text-xs ${dispo === d ? "border-indigo-500 bg-indigo-50 font-medium text-indigo-700" : "border-slate-200 hover:bg-slate-50"}`}>
              <input type="radio" name="disposition" value={d} className="sr-only" required onChange={() => setDispo(d)} />{d}
            </label>
          ))}
        </div>
      </fieldset>
      {!start && !elapsed && <div><label className="label" htmlFor="duration_min">Duration (minutes, if not timed)</label><input id="duration_min" name="duration_min" type="number" min="0" step="0.5" className="input w-32" /></div>}
      {LOSTY.includes(dispo) && <div><label className="label" htmlFor="lost_reason">Lost reason</label><input id="lost_reason" name="lost_reason" defaultValue={dispo} className="input" /></div>}
      <div><label className="label" htmlFor={`remarks-${lead.id}`}>Remarks</label><textarea id={`remarks-${lead.id}`} name="remarks" rows={2} className="input" /></div>
      <div>
        <label className="label" htmlFor={`fu-${lead.id}`}>Next follow-up</label>
        <div className="flex flex-wrap gap-1">
          {presets.map(([l, f]) => <button key={l} type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setFu(local(f()))}>{l}</button>)}
        </div>
        <input id={`fu-${lead.id}`} type="datetime-local" name="next_followup" value={fu} onChange={(e) => setFu(e.target.value)} className="input mt-1" />
      </div>
      <details>
        <summary className="cursor-pointer text-xs text-slate-500">Override stage (otherwise set from disposition)</summary>
        <select name="stage_id" className="input mt-1" defaultValue="" aria-label="Stage override"><option value="">Automatic</option>{stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      </details>
      <button className="btn w-full">Save call{next ? " & next lead →" : ""}</button>
    </form>
  );
}
