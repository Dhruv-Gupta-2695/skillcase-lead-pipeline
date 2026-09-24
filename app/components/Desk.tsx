"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Column, Lead } from "@/lib/types";
import { runEval } from "@/lib/eval";
import { REVIEW } from "@/lib/config";
import Drawer, { type HumanAction } from "./Drawer";
import { toCsv, download } from "./csv";

type BoardCol = Exclude<Column, "merged">;
const COLUMNS: Array<{ id: BoardCol; title: string; hint: string }> = [
  { id: "call_now", title: "Call now", hint: "Asked for a call that hasn't happened yet" },
  { id: "needs_review", title: "Needs review", hint: "A check failed or the system is unsure" },
  { id: "ready", title: "Ready", hint: "Qualified, message drafted, sorted by score" },
  { id: "nurture", title: "Nurture", hint: "Just exploring or blocked for now" },
  { id: "not_a_fit", title: "Not a fit", hint: "Outside healthcare or outside Europe" },
  { id: "approved", title: "Approved", hint: "Checked by a person, ready to contact" },
];

export const effectiveColumn = (l: Lead, h?: HumanAction): BoardCol => {
  if (!h) return l.column as BoardCol;
  if (h.action === "reject") return "not_a_fit";
  if (h.action === "override" && h.override === "not_relevant") return "not_a_fit";
  if (h.action === "override" && h.override === "call_now") return "call_now";
  if (h.action === "override" && h.override === "nurture") return "nurture";
  if (h.action === "override" && h.override === "ready") return "ready";
  return "approved";
};

export default function Desk({ initialLeads, initialRunDate }: { initialLeads: Lead[]; initialRunDate: string }) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [runId, setRunId] = useState(`demo-${initialRunDate}`);
  const [human, setHuman] = useState<Record<string, HumanAction>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [error, setError] = useState("");
  const [passcode, setPasscode] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Approvals persist in this browser (decision: browser storage + export)
  useEffect(() => {
    try { setHuman(JSON.parse(localStorage.getItem(`approvals:${runId}`) ?? "{}")); } catch { setHuman({}); }
  }, [runId]);
  const saveHuman = (next: Record<string, HumanAction>) => {
    setHuman(next);
    try { localStorage.setItem(`approvals:${runId}`, JSON.stringify(next)); } catch { /* storage unavailable: keep in memory */ }
  };

  const visible = leads.filter((l) => l.column !== "merged");
  const byCol = useMemo(() => {
    const m = Object.fromEntries(COLUMNS.map((c) => [c.id, [] as Lead[]])) as Record<BoardCol, Lead[]>;
    for (const l of visible) m[effectiveColumn(l, human[l.lead_id])].push(l);
    for (const k of Object.keys(m) as BoardCol[]) m[k].sort((a, b) => (b.priority?.score ?? 0) - (a.priority?.score ?? 0));
    return m;
  }, [visible, human]);

  const processed = leads.some((l) => l.classify);
  const ev = useMemo(() => (processed ? runEval(leads) : null), [leads, processed]);
  const reviewed = leads.filter((l) => l.review);
  const flagRate = reviewed.length ? reviewed.filter((l) => l.review!.verdict === "flag").length / reviewed.length : 0;

  async function runLive(file: File) {
    setError("");
    const csv = await file.text();
    const res = await fetch("/api/clean", { method: "POST", body: csv });
    const data = await res.json();
    if (!data.ok) { setError(`File rejected: ${data.error}`); return; }
    const cleaned: Lead[] = data.leads;
    setLeads(cleaned); setRunId(`live-${Date.now()}`); setOpenId(null);
    const todo = cleaned.filter((l) => l.column !== "merged");
    for (let i = 0; i < todo.length; i++) {
      setProgress({ done: i, total: todo.length, current: `${todo[i].lead_id} ${todo[i].clean.name}` });
      const r = await fetch("/api/process", {
        method: "POST", headers: { "content-type": "application/json", "x-demo-passcode": passcode },
        body: JSON.stringify(todo[i]),
      });
      const out = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
      if (r.status === 401) { setError(out.error); setProgress(null); return; }
      // Fail closed per lead: a failed AI call parks that lead in Needs review and the run continues
      const next: Lead = r.ok ? out : { ...todo[i], column: "needs_review",
        gates: [...todo[i].gates, { stage: "classify", pass: false, reason: `AI step failed (fail closed): ${out.error ?? r.status}` }] };
      setLeads((prev) => prev.map((l) => (l.lead_id === next.lead_id ? next : l)));
    }
    setProgress(null);
  }

  function bulkApprove() {
    const reviewer = localStorage.getItem("reviewer") || prompt("Your name (for the approval log)") || "";
    if (!reviewer) return;
    localStorage.setItem("reviewer", reviewer);
    const next = { ...human };
    for (const l of byCol.ready) {
      const noFlags = !(l.classify?.flags.length) && l.review?.verdict === "approve";
      if (noFlags) next[l.lead_id] = { action: "approve", reviewer, timestamp: new Date().toISOString(), bulk: true };
    }
    saveHuman(next);
  }

  const readyNoFlags = byCol.ready.filter((l) => !(l.classify?.flags.length) && l.review?.verdict === "approve").length;
  const open = leads.find((l) => l.lead_id === openId) ?? null;

  return (
    <main>
      <header className="top">
        <div>
          <h1>Skillcase lead desk</h1>
          <p>A raw lead sheet, cleaned, qualified, scored and drafted by AI, checked by rules and a second AI, and approved by you.</p>
        </div>
        <div className="actions">
          <input ref={fileRef} type="file" accept=".csv" hidden onChange={(e) => e.target.files?.[0] && runLive(e.target.files[0])} />
          <input type="password" placeholder="Live-run passcode" value={passcode} onChange={(e) => setPasscode(e.target.value)} aria-label="Live-run passcode" />
          <button className="btn primary" disabled={!!progress} onClick={() => fileRef.current?.click()}>Upload CSV and run live</button>
          <button className="btn" disabled={!readyNoFlags} onClick={bulkApprove} title="Approves only Ready leads with no flags">Approve {readyNoFlags} unflagged ready</button>
          <button className="btn" onClick={() => download("approved-leads-hubspot.csv", toCsv(leads, human, true))}>Export approved (HubSpot CSV)</button>
          <button className="btn" onClick={() => download("full-audit.csv", toCsv(leads, human, false))}>Export full audit</button>
        </div>
      </header>

      <section className="stats" aria-label="Run summary">
        <div className="stat"><b>{leads.length}</b><span>rows in</span></div>
        <div className="stat"><b>{leads.filter((l) => l.column === "merged").length}</b><span>duplicates merged</span></div>
        {ev && <div className="stat"><b>{Math.round(ev.relevanceAgreement * 100)}%</b><span>relevance agrees with sales notes</span></div>}
        {ev && <div className="stat"><b>{Math.round(ev.overall * 100)}%</b><span>overall agreement with notes</span></div>}
        <div className={`stat ${flagRate > REVIEW.maxFlagRate ? "warn" : ""}`}><b>{Math.round(flagRate * 100)}%</b><span>flagged by AI reviewer{flagRate > REVIEW.maxFlagRate ? " (above 30%: check calibration)" : ""}</span></div>
        <div className="stat"><b>{Object.values(human).filter((h) => h.action !== "reject").length}</b><span>approved by a person</span></div>
      </section>

      {progress && (
        <div className="progress" role="status">
          Processing {progress.current} ({progress.done + 1} of {progress.total})
          <div className="bar"><i style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}

      <div className="board">
        {COLUMNS.map((c) => (
          <section key={c.id} className={`col ${c.id}`} aria-label={c.title}>
            <h2><em>{byCol[c.id].length}</em>{c.title}</h2>
            <p className="hint">{c.hint}</p>
            <div className="stack">
              {byCol[c.id].length === 0 && <div className="empty">No leads here.</div>}
              {byCol[c.id].map((l) => (
                <button key={l.lead_id} className={`card ${effectiveColumn(l, human[l.lead_id])}`} onClick={() => setOpenId(l.lead_id)}>
                  <div className="row">
                    <span className="name">{l.clean.name}</span>
                    {l.priority && <span className="score">{l.priority.score}</span>}
                  </div>
                  <div className="meta">{l.lead_id}, {l.clean.city}, {l.clean.education || "education unknown"}{l.clean.german_level ? `, ${l.clean.german_level}` : ""}</div>
                  {l.enrich?.intent.text && <div className="why">{l.enrich.intent.text}</div>}
                  {!l.classify && <div className="why">{l.gates.at(-1)?.reason}</div>}
                  <div className="chips">
                    {l.priority?.call_now && <span className="chip gold">asked for a call</span>}
                    {l.classify?.flags.map((f) => <span key={f} className={`chip ${f === "expectation_risk" ? "risk" : ""}`}>{f.replace(/_/g, " ")}</span>)}
                    {l.clean.merged_ids.length > 0 && <span className="chip">{l.clean.merged_ids.length} duplicate{l.clean.merged_ids.length > 1 ? "s" : ""} merged</span>}
                    {human[l.lead_id] && <span className={`chip ${human[l.lead_id].action === "reject" ? "risk" : "ok"}`}>{({ approve: "approved", edit_approve: "edited & approved", override: "overridden", reject: "rejected" } as const)[human[l.lead_id].action]}</span>}
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      {open && (
        <Drawer
          lead={open}
          merged={leads.filter((l) => l.duplicate_of === open.lead_id)}
          human={human[open.lead_id]}
          onAct={(h) => saveHuman({ ...human, [open.lead_id]: h })}
          onUndo={() => { const n = { ...human }; delete n[open.lead_id]; saveHuman(n); }}
          onClose={() => setOpenId(null)}
        />
      )}
    </main>
  );
}
