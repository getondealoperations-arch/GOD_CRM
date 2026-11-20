"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { moveStage } from "@/app/(app)/actions";
import type { Row } from "@/lib/db";

export function Kanban({ stages, cards: initial, canEdit }: { stages: Row[]; cards: Row[]; canEdit: boolean }) {
  const [cards, setCards] = useState(initial);
  const [over, setOver] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [, start] = useTransition();

  function drop(stageId: number, leadId: number) {
    setOver(null);
    const card = cards.find((c) => c.id === leadId);
    const stage = stages.find((s) => s.id === stageId)!;
    if (!card || card.stage_id === stageId) return;
    let reason: string | undefined;
    if (stage.is_lost) { reason = prompt(`Lost reason for ${card.name}?`) ?? ""; if (!reason.trim()) return; }
    const prev = cards;
    setCards(cards.map((c) => (c.id === leadId ? { ...c, stage_id: stageId } : c)));
    start(async () => {
      const r = await moveStage(leadId, stageId, reason);
      if (r?.error) { setErr(r.error); setCards(prev); } else setErr("");
    });
  }

  return (
    <>
      {err && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{err}</p>}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {stages.map((s) => {
          const col = cards.filter((c) => c.stage_id === s.id);
          return (
            <div key={s.id}
              onDragOver={(e) => { if (canEdit) { e.preventDefault(); setOver(s.id); } }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => drop(s.id, Number(e.dataTransfer.getData("text/plain")))}
              className={`flex w-64 shrink-0 flex-col rounded-xl border bg-slate-100/70 ${over === s.id ? "border-indigo-400 bg-indigo-50" : "border-slate-200"}`}>
              <div className="sticky top-0 rounded-t-xl border-b border-slate-200 bg-surface px-3 py-2" style={{ borderTop: `3px solid ${s.color}` }}>
                <div className="text-sm font-semibold">{s.name}</div>
                <div className="text-xs text-slate-500">{s.total} leads{s.avg_time ? ` · avg ${s.avg_time}` : ""}{s.value ? ` · ₹${Number(s.value).toLocaleString("en-IN")}` : ""}</div>
              </div>
              <div className="max-h-[65vh] space-y-2 overflow-y-auto p-2">
                {col.map((c) => (
                  <div key={c.id} draggable={canEdit} onDragStart={(e) => e.dataTransfer.setData("text/plain", String(c.id))}
                    className="cursor-grab rounded-lg border border-slate-200 bg-surface p-2 text-sm shadow-sm active:cursor-grabbing">
                    <Link href={`/leads/${c.id}`} className="font-medium hover:underline">{c.name}</Link>
                    <div className="text-xs text-slate-500">{c.business_name ?? c.mobile}</div>
                    <div className="mt-1 flex justify-between text-xs text-slate-400">
                      <span>{c.owner ?? "Unassigned"}</span><span>{c.days_in_stage}d in stage</span>
                    </div>
                  </div>
                ))}
                {s.total > col.length && <Link href={`/leads?stage=${s.id}`} className="block text-center text-xs text-indigo-600">+{s.total - col.length} more</Link>}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
