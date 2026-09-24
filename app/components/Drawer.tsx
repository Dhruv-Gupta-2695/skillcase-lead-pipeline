"use client";
import { useEffect, useState } from "react";
import type { Claim, Lead } from "@/lib/types";
import { qcOutreach } from "@/lib/qc";

export interface HumanAction {
  action: "approve" | "edit_approve" | "override" | "reject";
  reviewer: string;
  timestamp: string;
  reason?: string;
  edited_message?: string;
  override?: "ready" | "call_now" | "nurture" | "not_relevant";
  bulk?: boolean;
}

const STAGE_NAMES: Record<string, string> = {
  intake: "Intake", clean: "Clean", classify: "Classify", enrich: "Understand",
  prioritize: "Prioritize", outreach: "Outreach", ai_review: "AI review", human_approval: "Human approval",
};

const Q = ({ c }: { c: Claim }) =>
  c.text ? <div className="claim">{c.text}{c.quote && <span className="quote">{c.quote}</span>}</div> : null;

export default function Drawer({ lead: l, merged, human, onAct, onUndo, onClose }: {
  lead: Lead; merged: Lead[]; human?: HumanAction;
  onAct: (h: HumanAction) => void; onUndo: () => void; onClose: () => void;
}) {
  const [reviewer, setReviewer] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(l.outreach?.message ?? "");
  const [mode, setMode] = useState<"" | "override" | "reject">("");
  const [override, setOverride] = useState<HumanAction["override"]>("ready");
  const [reason, setReason] = useState("");

  useEffect(() => { setReviewer(localStorage.getItem("reviewer") ?? ""); }, []);
  useEffect(() => { setDraft(l.outreach?.message ?? ""); setEditing(false); setMode(""); setReason(""); }, [l.lead_id, l.outreach?.message]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Edited messages go through the same banned-phrase / length / name checks as AI drafts
  const editProblems = editing && l.outreach
    ? qcOutreach(l, { subject: l.outreach.subject ?? null, message: draft, talking_points: l.outreach.talking_points ?? null,
        facts_used: [{ fact: "", quote: "x" }, { fact: "", quote: "x" }] }, l.outreach.channel)
        .filter((p) => !p.startsWith("Only") && !p.startsWith("Call Now"))
    : [];

  const act = (h: Omit<HumanAction, "reviewer" | "timestamp">) => {
    if (!reviewer.trim()) { alert("Add your name first so the approval is logged."); return; }
    localStorage.setItem("reviewer", reviewer.trim());
    onAct({ ...h, reviewer: reviewer.trim(), timestamp: new Date().toISOString() });
  };

  const e = l.enrich;
  return (
    <>
      <div className="shade" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={`Lead ${l.clean.name}`}>
        <button className="btn close" onClick={onClose}>Close</button>
        <h3>{l.clean.name}</h3>
        <div className="sub">
          {l.lead_id}, {l.clean.city}, {l.clean.phone ? l.clean.phone.replace(/^\+91(\d{5})(\d{5})$/, "+91 $1 $2") : "no phone"}, {l.clean.email ?? "no email"}
          {merged.length > 0 && <> (merged: {merged.map((m) => m.lead_id).join(", ")})</>}
        </div>

        <h4>Why it's in this column</h4>
        <p className="sub" style={{ marginTop: 0 }}>Green passed, amber passed after the system corrected the AI, red failed.</p>
        <ol className="chart">
          {l.gates.map((g, i) => (
            <li key={i} className={g.stage === "human_approval" ? (human ? "" : "wait") : !g.pass ? "fail" : /removed|Contradiction|added by rule|upgraded|downgraded|capped/.test(g.reason) ? "fixed" : ""}>
              <strong>{STAGE_NAMES[g.stage] ?? g.stage}</strong>
              <span>{g.stage === "human_approval" && human ? `${human.action.replace("_", " ")} by ${human.reviewer}` : g.reason}</span>
            </li>
          ))}
        </ol>

        {l.classify && (
          <>
            <h4>AI verdict</h4>
            <div>
              <b>{l.classify.relevant ? "Relevant" : "Not relevant"}</b>, confidence {l.classify.confidence.toFixed(2)}
              {l.classify.track === "course_only" && ", course-only lead"}
            </div>
            <Q c={l.classify.reason} />
            {l.classify.flags.length > 0 && <div className="chips">{l.classify.flags.map((f) => <span key={f} className="chip risk">{f.replace(/_/g, " ")}</span>)}</div>}
            <h4>Sales note from the original sheet</h4>
            <div className="note">{l.human_note || "No note"}<br /><small>Hidden from the AI. Shown here only after its decision, so you can compare.</small></div>
          </>
        )}

        {e && (
          <>
            <h4>Lead profile</h4>
            {e.profile.map((c, i) => <Q key={i} c={c} />)}
            <div>German: {l.clean.german_level ?? "unknown"} ({e.german_certified ? "certified" : "claimed, not certified"})</div>
            <h4>Goal and intent</h4><Q c={e.intent} />
            {e.needs.length > 0 && <><h4>Needs</h4>{e.needs.map((c, i) => <Q key={i} c={c} />)}</>}
            <h4>Objections</h4>
            {e.objections.length ? e.objections.map((c, i) => <div key={i}><span className="chip">{c.type}</span><Q c={c} /></div>) : <div className="sub">None raised</div>}
            <h4>Ask the lead about</h4>
            {e.missing_info.length ? <ul className="plain">{e.missing_info.map((m, i) => <li key={i}>{m}</li>)}</ul> : <div className="sub">Nothing missing</div>}
            <h4>Opportunity</h4><Q c={e.opportunity} />
            <h4>Recommended next step</h4><div>{e.next_step}</div>
          </>
        )}

        {l.priority && (
          <>
            <h4>Priority: {l.priority.score} ({l.priority.band})</h4>
            <ul className="plain">{l.priority.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </>
        )}

        {l.outreach && (
          <>
            <h4>{l.outreach.attempts ? "Outreach draft" : "Close-out message"} ({l.outreach.channel === "email" ? "email" : "WhatsApp"})</h4>
            {l.outreach.subject && <div><b>Subject:</b> {l.outreach.subject}</div>}
            {editing ? <textarea value={draft} onChange={(ev) => setDraft(ev.target.value)} aria-label="Edit message" /> :
              <div className="msg">{human?.edited_message ?? l.outreach.message}</div>}
            {editProblems.length > 0 && <ul className="problems">{editProblems.map((p) => <li key={p}>{p}</li>)}</ul>}
            {l.outreach.talking_points && <><b>Call talking points</b><ul className="plain">{l.outreach.talking_points.map((t, i) => <li key={i}>{t}</li>)}</ul></>}
            {l.outreach.facts_used && <div className="sub" style={{ marginTop: 6 }}>Lead facts used: {l.outreach.facts_used.map((f) => `${f.verified ? "✓" : "✗"} ${f.fact}`).join("; ")}</div>}
          </>
        )}

        {l.review && (
          <>
            <h4>AI reviewer: {l.review.verdict === "approve" ? "approved" : "flagged"}</h4>
            {l.review.issues.length ? <ul className="plain">{l.review.issues.map((i, k) => <li key={k}><b>{i.severity}</b> ({i.stage}): {i.problem}</li>)}</ul> : <div className="sub">No issues found</div>}
          </>
        )}

        <h4>Your decision</h4>
        {human ? (
          <div className="done">
            {human.action.replace("_", " ")} by {human.reviewer} on {new Date(human.timestamp).toLocaleString()}
            {human.bulk && " (bulk)"}{human.override && `, moved to ${human.override.replace("_", " ")}`}{human.reason && `. Reason: ${human.reason}`}
            <div style={{ marginTop: 8 }}><button className="btn" onClick={onUndo}>Undo</button></div>
          </div>
        ) : (
          <div className="panel">
            <div className="row"><label>Your name <input type="text" value={reviewer} onChange={(ev) => setReviewer(ev.target.value)} /></label></div>
            <div className="row">
              {!editing && <button className="btn primary" onClick={() => act({ action: "approve" })}>Approve</button>}
              {l.outreach && !editing && <button className="btn" onClick={() => setEditing(true)}>Edit message</button>}
              {editing && <button className="btn primary" disabled={editProblems.length > 0} onClick={() => act({ action: "edit_approve", edited_message: draft })}>Save edit and approve</button>}
              {editing && <button className="btn" onClick={() => { setEditing(false); setDraft(l.outreach?.message ?? ""); }}>Cancel edit</button>}
              <button className="btn" onClick={() => setMode(mode === "override" ? "" : "override")}>Override</button>
              <button className="btn danger" onClick={() => setMode(mode === "reject" ? "" : "reject")}>Reject</button>
            </div>
            {mode && (
              <div className="row">
                {mode === "override" && (
                  <select value={override} onChange={(ev) => setOverride(ev.target.value as HumanAction["override"])} aria-label="Move lead to">
                    <option value="ready">Move to Ready</option><option value="call_now">Move to Call now</option>
                    <option value="nurture">Move to Nurture</option><option value="not_relevant">Mark not relevant</option>
                  </select>
                )}
                <input type="text" placeholder="Reason (required)" value={reason} onChange={(ev) => setReason(ev.target.value)} style={{ flex: 1 }} />
                <button className="btn primary" disabled={!reason.trim()}
                  onClick={() => act(mode === "reject" ? { action: "reject", reason } : { action: "override", override, reason })}>
                  {mode === "reject" ? "Reject lead" : "Save override"}
                </button>
              </div>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
