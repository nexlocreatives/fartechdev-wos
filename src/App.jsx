import React, { useState, useEffect, useCallback } from "react";
import {
  Building2, FolderKanban, Users, FileText, Receipt, Ticket as TicketIcon,
  Calendar, Clock, Rocket, MessageSquare, BarChart3, Bell, Settings as SettingsIcon,
  LogOut, Plus, ChevronRight, CheckCircle2, Circle, AlertCircle,
  Search, X, Paperclip, Send, ArrowLeft, Play, Square,
  Download, Upload, CheckCheck, MoreHorizontal, LayoutGrid,
  ListChecks, Video, UserPlus, TrendingUp, Wallet, FileCheck2, PackageCheck, Home, Loader2,
} from "lucide-react";
import { supabase, callEdgeFunction } from "./lib/supabaseClient";
import { useSession, signOut } from "./lib/useSession";
import { navFor, channelsFor, isAdminLevel, roleLabel, CHANNEL_LABEL } from "./lib/roles";

/* ============================================================================
   FAR TECH & DEVELOPERS — Operations Console
   Fully wired to Supabase. Role/visibility logic mirrors supabase_schema_v2.sql
   exactly — RLS is the source of truth for what data comes back; this file
   just decides what UI to show for a given profile.
   ============================================================================ */

const LOGO = "/logo.png";

const T = {
  bg: "#0A0D12", panel: "#10141C", panel2: "#151A24", border: "#212734", borderSoft: "#1A2029",
  text: "#E8ECF3", textDim: "#8B93A7", textFaint: "#5B6478",
  iceLight: "#9FE0FA", iceMid: "#4FC3F7", blue: "#159AE8", blueDeep: "#0B6FB8",
  amber: "#E8A33D", green: "#3ECF8E", red: "#EF5B6B", violet: "#8B7FE8",
};
const FONT_DISPLAY = "'Space Grotesk', sans-serif";
const FONT_BODY = "'Inter', sans-serif";
const injectFonts = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; }
  ::-webkit-scrollbar { width: 8px; height: 8px; }
  ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 8px; }
`;

const STATUS_META = {
  waiting_assignment: { label: "Waiting Assignment", color: T.textDim },
  planning:           { label: "Planning",            color: T.iceMid },
  development:        { label: "Development",         color: T.blue },
  internal_qa:        { label: "Internal QA",         color: T.violet },
  agency_review:      { label: "Agency Review",       color: T.amber },
  changes_requested:  { label: "Changes Requested",   color: T.red },
  approved:           { label: "Approved",            color: T.green },
  released:           { label: "Released",            color: T.green },
  completed:          { label: "Completed",           color: T.green },
  on_hold:            { label: "On Hold",              color: T.textDim },
  cancelled:          { label: "Cancelled",            color: T.red },
};

/* ---------------------------------- UI atoms ---------------------------------- */

function Pill({ color, children }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, color, background: color + "1A", border: `1px solid ${color}33`, whiteSpace: "nowrap" }}>
      <span style={{ width: 6, height: 6, borderRadius: 2, background: color, transform: "rotate(45deg)" }} />
      {children}
    </span>
  );
}

function Avatar({ name, size = 30 }) {
  const safe = name || "?";
  const initials = safe.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  const hue = Math.abs(safe.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % 360;
  return (
    <div style={{ width: size, height: size, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.38, fontWeight: 700, color: "#fff", flexShrink: 0, background: `linear-gradient(135deg, hsl(${hue},70%,45%), hsl(${hue + 40},70%,35%))`, fontFamily: FONT_DISPLAY }}>{initials}</div>
  );
}

function Card({ children, style, ...rest }) {
  return <div style={{ background: T.panel, border: `1px solid ${T.border}`, borderRadius: 14, ...style }} {...rest}>{children}</div>;
}

function Button({ children, variant = "primary", icon: Icon, style, disabled, ...rest }) {
  const base = { display: "inline-flex", alignItems: "center", gap: 8, fontFamily: FONT_BODY, fontWeight: 600, fontSize: 13.5, padding: "9px 16px", borderRadius: 10, cursor: disabled ? "not-allowed" : "pointer", border: "1px solid transparent", opacity: disabled ? 0.5 : 1 };
  const variants = {
    primary: { background: `linear-gradient(135deg, ${T.iceMid}, ${T.blueDeep})`, color: "#04121C" },
    ghost: { background: "transparent", color: T.textDim, border: `1px solid ${T.border}` },
    subtle: { background: T.panel2, color: T.text, border: `1px solid ${T.border}` },
    danger: { background: T.red + "1A", color: T.red, border: `1px solid ${T.red}44` },
  };
  return <button disabled={disabled} style={{ ...base, ...variants[variant], ...style }} {...rest}>{Icon && <Icon size={15} />}{children}</button>;
}

function StatCard({ icon: Icon, label, value, sub, accent }) {
  return (
    <Card style={{ padding: 18, flex: 1, minWidth: 160 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", background: accent + "1A", color: accent }}><Icon size={17} /></div>
      </div>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 700, color: T.text }}>{value}</div>
      <div style={{ fontSize: 12.5, color: T.textDim, marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11.5, color: accent, marginTop: 6, fontWeight: 600 }}>{sub}</div>}
    </Card>
  );
}

function SectionTitle({ children, action }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
      <h2 style={{ fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 600, color: T.text, margin: 0 }}>{children}</h2>
      {action}
    </div>
  );
}

function ProgressBar({ value, color = T.blue }) {
  return <div style={{ height: 6, background: T.borderSoft, borderRadius: 4, overflow: "hidden", width: "100%" }}><div style={{ height: "100%", width: `${value}%`, background: color, borderRadius: 4 }} /></div>;
}

function Field({ label, children }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}><label style={{ fontSize: 12, color: T.textDim, fontWeight: 600 }}>{label}</label>{children}</div>;
}

const inputStyle = { background: T.panel2, border: `1px solid ${T.border}`, borderRadius: 9, padding: "9px 12px", color: T.text, fontSize: 13, outline: "none", fontFamily: FONT_BODY, width: "100%" };

function Spinner({ label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, color: T.textFaint, fontSize: 12.5, padding: 30, justifyContent: "center" }}>
      <Loader2 size={16} className="spin" /> {label || "Loading…"}
    </div>
  );
}

function ErrorBox({ message }) {
  if (!message) return null;
  return <div style={{ padding: 12, borderRadius: 9, background: T.red + "14", border: `1px solid ${T.red}33`, color: T.red, fontSize: 12.5, marginBottom: 14 }}>{message}</div>;
}

const TASK_STATUS_ICON = {
  done: <CheckCircle2 size={15} color={T.green} />,
  in_progress: <Circle size={15} color={T.blue} fill={T.blue} fillOpacity={0.25} />,
  in_review: <AlertCircle size={15} color={T.amber} />,
  todo: <Circle size={15} color={T.textFaint} />,
  blocked: <AlertCircle size={15} color={T.red} />,
};

/* ---------------------------------- Login ---------------------------------- */

function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("password"); // 'password' | 'magic'
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handlePasswordLogin(e) {
    e.preventDefault();
    setBusy(true); setStatus(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setStatus({ type: "error", text: error.message });
  }

  async function handleMagicLink(e) {
    e.preventDefault();
    setBusy(true); setStatus(null);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    setStatus(error ? { type: "error", text: error.message } : { type: "success", text: "Check your email for a login link." });
  }

  return (
    <div style={{ height: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_BODY }}>
      <style>{injectFonts}</style>
      <Card style={{ padding: 36, width: 380 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 26 }}>
          <img src={LOGO} alt="FAR Tech" style={{ width: 46, height: 46, objectFit: "contain" }} />
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 17, color: T.text }}>FAR TECH & DEVELOPERS</div>
          <div style={{ fontSize: 11.5, color: T.textFaint }}>Operations Console</div>
        </div>

        <form onSubmit={mode === "password" ? handlePasswordLogin : handleMagicLink}>
          <Field label="Email"><input style={inputStyle} type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" /></Field>
          {mode === "password" && (
            <Field label="Password"><input style={inputStyle} type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" /></Field>
          )}
          {status && (
            <div style={{ fontSize: 12, marginBottom: 14, color: status.type === "error" ? T.red : T.green }}>{status.text}</div>
          )}
          <Button style={{ width: "100%", justifyContent: "center" }} disabled={busy}>
            {busy ? "Please wait…" : mode === "password" ? "Sign in" : "Send magic link"}
          </Button>
        </form>

        <div onClick={() => setMode(mode === "password" ? "magic" : "password")} style={{ textAlign: "center", fontSize: 12, color: T.textFaint, marginTop: 16, cursor: "pointer" }}>
          {mode === "password" ? "Use a magic link instead" : "Use a password instead"}
        </div>
      </Card>
    </div>
  );
}

/* ---------------------------------- Set password (post-invite) ---------------------------------- */

function SetPasswordScreen({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (password.length < 8) { setErr("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setErr("Passwords don't match."); return; }
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    // Clear the invite token out of the URL so a refresh doesn't show this again.
    window.history.replaceState(null, "", window.location.pathname);
    onDone();
  }

  return (
    <div style={{ height: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_BODY }}>
      <style>{injectFonts}</style>
      <Card style={{ padding: 36, width: 380 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 26 }}>
          <img src={LOGO} alt="FAR Tech" style={{ width: 46, height: 46, objectFit: "contain" }} />
          <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 17, color: T.text }}>Welcome to FAR Tech</div>
          <div style={{ fontSize: 11.5, color: T.textFaint, textAlign: "center" }}>Set a password to finish creating your account.</div>
        </div>
        <form onSubmit={submit}>
          <Field label="New password"><input style={inputStyle} type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" /></Field>
          <Field label="Confirm password"><input style={inputStyle} type="password" required value={confirm} onChange={e => setConfirm(e.target.value)} /></Field>
          {err && <div style={{ fontSize: 12, marginBottom: 14, color: T.red }}>{err}</div>}
          <Button style={{ width: "100%", justifyContent: "center" }} disabled={busy}>{busy ? "Saving…" : "Set password & continue"}</Button>
        </form>
      </Card>
    </div>
  );
}

/* ---------------------------------- Agency onboarding checklist ---------------------------------- */

const ONBOARDING_COPY = {
  company_details: { title: "Company Details", blurb: "Confirm the basics we have on file for your agency." },
  upload_logo: { title: "Upload Logo", blurb: "Add your agency's logo — shown across the portal and on invoices." },
  team_members: { title: "Team Members", blurb: "Invite at least one teammate so you're not the only point of contact." },
  billing_information: { title: "Billing Information", blurb: "Where should invoices be sent?" },
  preferred_communication: { title: "Preferred Communication", blurb: "How should FAR Tech reach you day-to-day?" },
  development_process_guide: { title: "Development Process Guide", blurb: "A quick overview of how we build together." },
  acceptance_of_sop: { title: "Acceptance of SOP", blurb: "Confirm you've read and accept our standard operating procedure." },
};

function AgencyOnboardingFlow({ profile, onFinished }) {
  const [steps, setSteps] = useState(null);
  const [agency, setAgency] = useState(profile.agencies);
  const [active, setActive] = useState(0);
  const [form, setForm] = useState({
    contact_person: profile.agencies?.contact_person || "",
    phone: profile.agencies?.phone || "",
    time_zone: profile.agencies?.time_zone || "UTC",
    billing_email: profile.agencies?.billing_email || "",
    billing_address: profile.agencies?.billing_address || "",
    preferred_channel: profile.agencies?.preferred_channel || "email",
  });
  const [teamEmail, setTeamEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(() => {
    supabase.from("agency_onboarding_steps").select("*").eq("agency_id", profile.agency_id).then(({ data }) => setSteps(data || []));
    supabase.from("agencies").select("*").eq("id", profile.agency_id).single().then(({ data }) => data && setAgency(data));
  }, [profile.agency_id]);
  useEffect(load, [load]);

  if (!steps) return <div style={{ height: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center" }}><Spinner label="Loading onboarding…" /></div>;

  const order = ["company_details", "upload_logo", "team_members", "billing_information", "preferred_communication", "development_process_guide", "acceptance_of_sop"];
  const ordered = order.map(key => steps.find(s => s.step_key === key)).filter(Boolean);
  const current = ordered[active];

  async function markComplete(stepKey, agencyPatch) {
    setBusy(true); setErr(null);
    if (agencyPatch) {
      const { error } = await supabase.from("agencies").update(agencyPatch).eq("id", profile.agency_id);
      if (error) { setErr(error.message); setBusy(false); return; }
    }
    const step = steps.find(s => s.step_key === stepKey);
    const { error } = await supabase.from("agency_onboarding_steps").update({ is_complete: true, completed_at: new Date().toISOString() }).eq("id", step.id);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    load();
    if (active < ordered.length - 1) setActive(active + 1);
    else onFinished();
  }

  async function inviteTeammate() {
    if (!teamEmail.trim()) return;
    setBusy(true); setErr(null);
    const { error } = await callEdgeFunction("invite-agency-user", {
      email: teamEmail, fullName: teamEmail, agencyId: profile.agency_id, agencyRole: "manager",
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setTeamEmail("");
    markComplete("team_members");
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div style={{ height: "100vh", background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", fontFamily: FONT_BODY, overflowY: "auto", padding: "40px 20px" }}>
      <style>{injectFonts}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <img src={LOGO} alt="FAR Tech" style={{ width: 30, height: 30, objectFit: "contain" }} />
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 16, color: T.text }}>Let's get {agency?.name} set up</div>
      </div>
      <div style={{ fontSize: 12.5, color: T.textFaint, marginBottom: 24 }}>{agency?.onboarding_progress || 0}% complete</div>

      <div style={{ width: "100%", maxWidth: 640, marginBottom: 20 }}>
        <ProgressBar value={agency?.onboarding_progress || 0} color={T.iceMid} />
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 26, flexWrap: "wrap", justifyContent: "center" }}>
        {ordered.map((s, i) => (
          <div key={s.step_key} onClick={() => setActive(i)} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 11.5, fontWeight: 600,
            background: active === i ? T.panel2 : "transparent", border: `1px solid ${active === i ? T.border : "transparent"}`,
            color: s.is_complete ? T.green : active === i ? T.text : T.textFaint,
          }}>
            {s.is_complete ? <CheckCircle2 size={13} /> : <Circle size={13} />} {ONBOARDING_COPY[s.step_key]?.title || s.step_key}
          </div>
        ))}
      </div>

      <Card style={{ padding: 28, width: "100%", maxWidth: 520 }}>
        <ErrorBox message={err} />
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 700, color: T.text, marginBottom: 6 }}>{ONBOARDING_COPY[current.step_key]?.title}</div>
        <div style={{ fontSize: 12.5, color: T.textFaint, marginBottom: 20 }}>{ONBOARDING_COPY[current.step_key]?.blurb}</div>

        {current.step_key === "company_details" && (
          <>
            <Field label="Contact person"><input style={inputStyle} value={form.contact_person} onChange={set("contact_person")} /></Field>
            <Field label="Phone"><input style={inputStyle} value={form.phone} onChange={set("phone")} /></Field>
            <Field label="Time zone"><input style={inputStyle} value={form.time_zone} onChange={set("time_zone")} /></Field>
            <Button disabled={busy} onClick={() => markComplete("company_details", { contact_person: form.contact_person, phone: form.phone, time_zone: form.time_zone })}>Save & continue</Button>
          </>
        )}

        {current.step_key === "upload_logo" && (
          <>
            <div style={{ border: `1.5px dashed ${T.border}`, borderRadius: 10, padding: 22, textAlign: "center", color: T.textFaint, fontSize: 12.5, marginBottom: 16 }}>
              <Upload size={18} style={{ marginBottom: 6 }} /><div>Logo upload wires to the `agency-logos` Storage bucket — for now, mark complete and add it later from Settings.</div>
            </div>
            <Button disabled={busy} onClick={() => markComplete("upload_logo")}>Continue</Button>
          </>
        )}

        {current.step_key === "team_members" && (
          <>
            <Field label="Invite a teammate by email"><input style={inputStyle} type="email" value={teamEmail} onChange={e => setTeamEmail(e.target.value)} placeholder="colleague@youragency.com" /></Field>
            <div style={{ display: "flex", gap: 10 }}>
              <Button disabled={busy || !teamEmail} onClick={inviteTeammate}>Invite & continue</Button>
              <Button variant="ghost" disabled={busy} onClick={() => markComplete("team_members")}>Skip for now</Button>
            </div>
          </>
        )}

        {current.step_key === "billing_information" && (
          <>
            <Field label="Billing email"><input style={inputStyle} type="email" value={form.billing_email} onChange={set("billing_email")} /></Field>
            <Field label="Billing address"><textarea rows={3} style={{ ...inputStyle, resize: "vertical" }} value={form.billing_address} onChange={set("billing_address")} /></Field>
            <Button disabled={busy} onClick={() => markComplete("billing_information", { billing_email: form.billing_email, billing_address: form.billing_address })}>Save & continue</Button>
          </>
        )}

        {current.step_key === "preferred_communication" && (
          <>
            <Field label="Preferred channel">
              <select style={inputStyle} value={form.preferred_channel} onChange={set("preferred_channel")}>
                <option value="email">Email</option><option value="in_app">In-app chat</option>
              </select>
            </Field>
            <Button disabled={busy} onClick={() => markComplete("preferred_communication", { preferred_channel: form.preferred_channel })}>Save & continue</Button>
          </>
        )}

        {current.step_key === "development_process_guide" && (
          <>
            <div style={{ fontSize: 12.8, color: T.textDim, lineHeight: 1.6, marginBottom: 16 }}>
              Projects move through: request → assignment → planning → development → internal QA → your review → approval → release. You'll see status update live on every project, and approvals happen right in the app.
            </div>
            <Button disabled={busy} onClick={() => markComplete("development_process_guide")}>I understand, continue</Button>
          </>
        )}

        {current.step_key === "acceptance_of_sop" && (
          <>
            <div style={{ fontSize: 12.8, color: T.textDim, lineHeight: 1.6, marginBottom: 16 }}>
              By continuing, you confirm you've read and accept FAR Tech's standard operating procedure for white-label delivery.
            </div>
            <Button disabled={busy} onClick={() => markComplete("acceptance_of_sop")}>Accept & finish setup</Button>
          </>
        )}
      </Card>

      <div onClick={onFinished} style={{ marginTop: 18, fontSize: 12, color: T.textFaint, cursor: "pointer" }}>Skip for now — I'll finish this later</div>
    </div>
  );
}

/* ---------------------------------- Sidebar / Topbar ---------------------------------- */

function Sidebar({ profile, view, setView }) {
  const nav = navFor(profile);
  return (
    <div style={{ width: 236, flexShrink: 0, background: T.panel, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "22px 20px 18px" }}>
        <img src={LOGO} alt="FAR Tech" style={{ width: 30, height: 30, objectFit: "contain" }} />
        <div style={{ fontFamily: FONT_DISPLAY, fontWeight: 700, fontSize: 15.5, color: T.text, lineHeight: 1.1 }}>
          FAR TECH<div style={{ fontSize: 9.5, color: T.textFaint, fontWeight: 500, letterSpacing: 1.5, marginTop: 2 }}>OPERATIONS CONSOLE</div>
        </div>
      </div>

      <div style={{ margin: "0 14px 14px", padding: 12, borderRadius: 10, background: T.panel2, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 10 }}>
        <Avatar name={profile.full_name} size={32} />
        <div style={{ overflow: "hidden" }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{profile.full_name}</div>
          <div style={{ fontSize: 10.5, color: T.textFaint }}>{roleLabel(profile)}{profile.agencies ? ` · ${profile.agencies.name}` : ""}</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "4px 12px" }}>
        {nav.map(item => {
          const active = view === item.key;
          return (
            <div key={item.key} onClick={() => setView(item.key)} style={{ display: "flex", alignItems: "center", gap: 11, padding: "9.5px 12px", borderRadius: 9, cursor: "pointer", marginBottom: 2, fontSize: 13.3, fontWeight: active ? 600 : 500, color: active ? T.text : T.textDim, background: active ? T.panel2 : "transparent", borderLeft: active ? `2px solid ${T.iceMid}` : "2px solid transparent" }}>
              <item.icon size={16} color={active ? T.iceMid : T.textFaint} />{item.label}
            </div>
          );
        })}
      </div>

      <div style={{ padding: 14, borderTop: `1px solid ${T.borderSoft}` }}>
        <div onClick={signOut} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 9, cursor: "pointer", color: T.textDim, fontSize: 13 }}>
          <LogOut size={16} /> Sign out
        </div>
      </div>
    </div>
  );
}

function Topbar({ title }) {
  return (
    <div style={{ height: 62, flexShrink: 0, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", background: T.bg }}>
      <div style={{ fontFamily: FONT_DISPLAY, fontSize: 16.5, fontWeight: 600, color: T.text }}>{title}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: T.panel2, border: `1px solid ${T.border}`, borderRadius: 9, padding: "7px 12px", width: 230 }}>
          <Search size={14} color={T.textFaint} />
          <input placeholder="Search projects, agencies…" style={{ background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 12.5, width: "100%" }} />
        </div>
        <Bell size={18} color={T.textDim} />
      </div>
    </div>
  );
}

/* ---------------------------------- Dashboard (generic — RLS scopes the data) ---------------------------------- */

function Dashboard({ profile, goProjects, goAgencies, goProject }) {
  const [stats, setStats] = useState(null);
  const [recentProjects, setRecentProjects] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => {
    (async () => {
      const [{ count: projectCount }, { count: pendingApprovals }, { data: invoices }, { data: projects, error }] = await Promise.all([
        supabase.from("projects").select("*", { count: "exact", head: true }).not("status", "in", "(completed,released,cancelled)"),
        supabase.from("approvals").select("*", { count: "exact", head: true }).eq("decision", "pending"),
        supabase.from("invoices").select("amount,status"),
        supabase.from("projects").select("*, agencies(name)").order("created_at", { ascending: false }).limit(5),
      ]);
      if (error) setErr(error.message);
      const outstanding = (invoices || []).filter(i => i.status !== "paid").reduce((a, i) => a + Number(i.amount), 0);
      setStats({ projectCount, pendingApprovals, outstanding });
      setRecentProjects(projects || []);
    })();
  }, []);

  if (!stats) return <Spinner label="Loading dashboard…" />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <ErrorBox message={err} />
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <StatCard icon={FolderKanban} label="Active projects" value={stats.projectCount ?? 0} accent={T.blue} />
        <StatCard icon={AlertCircle} label="Pending approvals" value={stats.pendingApprovals ?? 0} accent={T.amber} />
        <StatCard icon={Wallet} label="Outstanding invoices" value={`$${stats.outstanding.toLocaleString()}`} accent={T.red} />
        {isAdminLevel(profile) && <StatCard icon={Building2} label="Agencies" value="—" sub="See Agencies tab" accent={T.iceMid} />}
      </div>

      <Card style={{ padding: 20 }}>
        <SectionTitle action={<Button variant="ghost" onClick={goProjects}>View all <ChevronRight size={14} /></Button>}>
          {isAdminLevel(profile) ? "Recent projects" : "Your projects"}
        </SectionTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {recentProjects.length === 0 && <div style={{ fontSize: 12.5, color: T.textFaint }}>No projects yet.</div>}
          {recentProjects.map(p => (
            <div key={p.id} onClick={() => goProject(p)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", background: T.panel2, borderRadius: 10, cursor: "pointer", border: `1px solid ${T.borderSoft}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Avatar name={p.agencies?.name || p.name} size={30} />
                <div>
                  <div style={{ fontSize: 13.3, fontWeight: 600, color: T.text }}>{p.name}</div>
                  <div style={{ fontSize: 11.5, color: T.textFaint }}>{p.agencies?.name} · {p.development_type}</div>
                </div>
              </div>
              <Pill color={STATUS_META[p.status]?.color || T.textDim}>{STATUS_META[p.status]?.label || p.status}</Pill>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ---------------------------------- Agencies (Admin + PM "view assigned") ---------------------------------- */

function AgenciesView({ onOpenAgency }) {
  const [agencies, setAgencies] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("agencies").select("*").order("created_at", { ascending: false });
    if (error) setErr(error.message); else setAgencies(data);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!agencies) return <Spinner label="Loading agencies…" />;

  return (
    <div>
      <SectionTitle action={<Button icon={Plus} onClick={() => setShowNew(true)}>Create Agency</Button>}>All agencies ({agencies.length})</SectionTitle>
      <ErrorBox message={err} />
      {showNew && <NewAgencyForm onClose={() => setShowNew(false)} onCreated={load} />}
      <Card style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ background: T.panel2, textAlign: "left" }}>{["Agency", "Contact", "Plan", "Onboarding", "Status", ""].map(h => <th key={h} style={{ padding: "11px 16px", fontSize: 11, color: T.textFaint, fontWeight: 600, textTransform: "uppercase" }}>{h}</th>)}</tr></thead>
          <tbody>
            {agencies.map(a => (
              <tr key={a.id} onClick={() => onOpenAgency(a)} style={{ borderTop: `1px solid ${T.borderSoft}`, cursor: "pointer" }}>
                <td style={{ padding: "12px 16px" }}><div style={{ display: "flex", alignItems: "center", gap: 10 }}><Avatar name={a.name} size={30} /><div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{a.name}</div></div></td>
                <td style={{ padding: "12px 16px", fontSize: 12.5, color: T.textDim }}>{a.contact_person}<div style={{ fontSize: 11, color: T.textFaint }}>{a.email}</div></td>
                <td style={{ padding: "12px 16px", fontSize: 12.5, color: T.textDim, textTransform: "capitalize" }}>{a.white_label_plan}</td>
                <td style={{ padding: "12px 16px", width: 130 }}><ProgressBar value={a.onboarding_progress} color={a.onboarding_progress === 100 ? T.green : T.amber} /></td>
                <td style={{ padding: "12px 16px" }}><Pill color={a.status === "active" ? T.green : T.amber}>{a.status}</Pill></td>
                <td style={{ padding: "12px 16px" }}><ChevronRight size={15} color={T.textFaint} /></td>
              </tr>
            ))}
            {agencies.length === 0 && <tr><td colSpan={6} style={{ padding: 20, color: T.textFaint, fontSize: 12.5 }}>No agencies yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function NewAgencyForm({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: "", contact_person: "", email: "", phone: "", time_zone: "UTC", white_label_plan: "starter" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function handleCreate() {
    setBusy(true); setErr(null);
    const slug = form.name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const { data: agency, error: agencyErr } = await supabase.from("agencies").insert({ ...form, slug }).select().single();
    if (agencyErr) { setErr(agencyErr.message); setBusy(false); return; }

    const { error: inviteErr } = await callEdgeFunction("invite-agency-user", {
      email: form.email, fullName: form.contact_person, agencyId: agency.id, agencyRole: "owner",
    });
    setBusy(false);
    if (inviteErr) { setErr(`Agency created, but invite failed: ${inviteErr.message}`); return; }
    onCreated();
    onClose();
  }

  return (
    <Card style={{ padding: 20, marginBottom: 18 }}>
      <SectionTitle action={<X size={17} color={T.textFaint} style={{ cursor: "pointer" }} onClick={onClose} />}>Register a new agency</SectionTitle>
      <ErrorBox message={err} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <Field label="Agency name"><input style={inputStyle} value={form.name} onChange={set("name")} placeholder="e.g. Skyline Media" /></Field>
        <Field label="Contact person"><input style={inputStyle} value={form.contact_person} onChange={set("contact_person")} placeholder="Full name" /></Field>
        <Field label="Email"><input style={inputStyle} type="email" value={form.email} onChange={set("email")} placeholder="contact@agency.com" /></Field>
        <Field label="Phone"><input style={inputStyle} value={form.phone} onChange={set("phone")} placeholder="+1 …" /></Field>
        <Field label="Time zone"><input style={inputStyle} value={form.time_zone} onChange={set("time_zone")} /></Field>
        <Field label="White-label plan">
          <select style={inputStyle} value={form.white_label_plan} onChange={set("white_label_plan")}>
            <option value="starter">Starter</option><option value="growth">Growth</option><option value="enterprise">Enterprise</option>
          </select>
        </Field>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <Button icon={CheckCircle2} onClick={handleCreate} disabled={busy || !form.name || !form.email}>{busy ? "Creating…" : "Create agency & send invite"}</Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </div>
    </Card>
  );
}

function AgencyDetail({ agency, onBack, goProject }) {
  const [steps, setSteps] = useState(null);
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    supabase.from("agency_onboarding_steps").select("*").eq("agency_id", agency.id).then(({ data }) => setSteps(data || []));
    supabase.from("projects").select("*").eq("agency_id", agency.id).then(({ data }) => setProjects(data || []));
  }, [agency.id]);

  async function toggleStep(step) {
    const { error } = await supabase.from("agency_onboarding_steps").update({ is_complete: !step.is_complete, completed_at: !step.is_complete ? new Date().toISOString() : null }).eq("id", step.id);
    if (!error) setSteps(steps.map(s => s.id === step.id ? { ...s, is_complete: !step.is_complete } : s));
  }

  return (
    <div>
      <div onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, color: T.textDim, fontSize: 12.5, cursor: "pointer", marginBottom: 16 }}><ArrowLeft size={14} /> Back to agencies</div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
        <Avatar name={agency.name} size={52} />
        <div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 20, fontWeight: 700, color: T.text }}>{agency.name}</div>
          <div style={{ fontSize: 12.5, color: T.textFaint }}>{agency.contact_person} · {agency.email} · {agency.time_zone}</div>
        </div>
        <div style={{ marginLeft: "auto" }}><Pill color={agency.status === "active" ? T.green : T.amber}>{agency.status}</Pill></div>
      </div>

      <Card style={{ padding: 20, marginBottom: 18 }}>
        <SectionTitle>Onboarding checklist ({agency.onboarding_progress}%)</SectionTitle>
        {!steps ? <Spinner /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {steps.map(s => (
              <div key={s.id} onClick={() => toggleStep(s)} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: s.is_complete ? T.text : T.textFaint, cursor: "pointer" }}>
                {s.is_complete ? <CheckCircle2 size={16} color={T.green} /> : <Circle size={16} color={T.textFaint} />}{s.label}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card style={{ padding: 20 }}>
        <SectionTitle>Projects</SectionTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {projects.length === 0 && <div style={{ fontSize: 12.5, color: T.textFaint }}>No projects yet.</div>}
          {projects.map(p => (
            <div key={p.id} onClick={() => goProject(p)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", background: T.panel2, borderRadius: 10, cursor: "pointer" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{p.name}</div>
              <Pill color={STATUS_META[p.status]?.color}>{STATUS_META[p.status]?.label}</Pill>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ---------------------------------- Projects list ---------------------------------- */

function ProjectsList({ profile, goProject, goNew }) {
  const [projects, setProjects] = useState(null);
  const [filter, setFilter] = useState("all");
  const [err, setErr] = useState(null);

  useEffect(() => {
    supabase.from("projects").select("*, agencies(name)").order("created_at", { ascending: false })
      .then(({ data, error }) => { if (error) setErr(error.message); setProjects(data || []); });
  }, []);

  if (!projects) return <Spinner label="Loading projects…" />;
  const filtered = filter === "all" ? projects : projects.filter(p => p.status === filter);
  const canCreate = profile.user_type === "agency";

  return (
    <div>
      <SectionTitle action={canCreate && <Button icon={Plus} onClick={goNew}>New Project</Button>}>
        {profile.user_type === "agency" ? `My projects (${projects.length})` : `Projects (${projects.length})`}
      </SectionTitle>
      <ErrorBox message={err} />
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {["all", ...Object.keys(STATUS_META)].map(s => (
          <div key={s} onClick={() => setFilter(s)} style={{ padding: "6px 12px", borderRadius: 8, fontSize: 11.5, fontWeight: 600, cursor: "pointer", background: filter === s ? T.panel2 : "transparent", border: `1px solid ${filter === s ? T.border : "transparent"}`, color: filter === s ? T.text : T.textFaint, textTransform: "capitalize" }}>{s === "all" ? "All" : STATUS_META[s].label}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
        {filtered.map(p => (
          <Card key={p.id} onClick={() => goProject(p)} style={{ padding: 18, cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: T.text, fontFamily: FONT_DISPLAY }}>{p.name}</div>
                <div style={{ fontSize: 11.5, color: T.textFaint, marginTop: 2 }}>{p.agencies?.name ? p.agencies.name + " · " : ""}{p.client_name}</div>
              </div>
              <Pill color={STATUS_META[p.status]?.color || T.textDim}>{STATUS_META[p.status]?.label || p.status}</Pill>
            </div>
            <div style={{ display: "flex", gap: 14, fontSize: 11.5, color: T.textDim }}>
              <span>{p.development_type}</span><span>·</span><span style={{ textTransform: "capitalize" }}>{p.priority} priority</span><span>·</span><span>Due {p.deadline || "—"}</span>
            </div>
          </Card>
        ))}
        {filtered.length === 0 && <div style={{ fontSize: 12.5, color: T.textFaint }}>No projects match this filter.</div>}
      </div>
    </div>
  );
}

/* ---------------------------------- New Project ---------------------------------- */

function NewProjectForm({ profile, onCreated }) {
  const devTypes = ["web", "mobile", "saas", "ai", "ui_ux", "shopify", "wordpress", "custom"];
  const [form, setForm] = useState({ name: "", client_name: "", industry: "", priority: "medium", development_type: "web", description: "", deadline: "" });
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit() {
    setBusy(true); setErr(null);
    const { error } = await supabase.from("projects").insert({ ...form, agency_id: profile.agency_id, requested_by: profile.id, deadline: form.deadline || null });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setSubmitted(true);
    onCreated?.();
  }

  if (submitted) {
    return (
      <Card style={{ padding: 40, textAlign: "center" }}>
        <CheckCircle2 size={40} color={T.green} style={{ margin: "0 auto 14px" }} />
        <div style={{ fontFamily: FONT_DISPLAY, fontSize: 18, fontWeight: 700, color: T.text }}>Project submitted</div>
        <div style={{ fontSize: 13, color: T.textDim, marginTop: 6 }}>It's now in FAR Tech's Operations queue awaiting assignment.</div>
        <Button style={{ margin: "20px auto 0" }} onClick={() => { setSubmitted(false); setForm({ name: "", client_name: "", industry: "", priority: "medium", development_type: "web", description: "", deadline: "" }); }}>Submit another</Button>
      </Card>
    );
  }

  return (
    <div>
      <SectionTitle>New project request</SectionTitle>
      <Card style={{ padding: 24, maxWidth: 760 }}>
        <ErrorBox message={err} />
        <div style={{ fontSize: 12, fontWeight: 700, color: T.iceMid, textTransform: "uppercase", marginBottom: 14 }}>Basic</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Field label="Project name"><input style={inputStyle} value={form.name} onChange={set("name")} placeholder="e.g. Customer Portal Revamp" /></Field>
          <Field label="Client name"><input style={inputStyle} value={form.client_name} onChange={set("client_name")} placeholder="Your end-client's name" /></Field>
          <Field label="Industry"><input style={inputStyle} value={form.industry} onChange={set("industry")} placeholder="e.g. Fintech, Retail" /></Field>
          <Field label="Priority"><select style={inputStyle} value={form.priority} onChange={set("priority")}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field>
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: T.iceMid, textTransform: "uppercase", margin: "18px 0 14px" }}>Development type</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          {devTypes.map(t => (
            <div key={t} onClick={() => setForm({ ...form, development_type: t })} style={{ padding: "8px 14px", borderRadius: 9, fontSize: 12.5, fontWeight: 600, cursor: "pointer", textTransform: "capitalize", background: form.development_type === t ? `linear-gradient(135deg, ${T.iceMid}, ${T.blueDeep})` : T.panel2, color: form.development_type === t ? "#04121C" : T.textDim, border: `1px solid ${form.development_type === t ? "transparent" : T.border}` }}>{t.replace("_", "/")}</div>
          ))}
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: T.iceMid, textTransform: "uppercase", marginBottom: 14 }}>Requirements</div>
        <Field label="Description"><textarea rows={4} style={{ ...inputStyle, resize: "vertical" }} value={form.description} onChange={set("description")} placeholder="Describe scope, goals, and must-haves…" /></Field>
        <Field label="Documents"><div style={{ border: `1.5px dashed ${T.border}`, borderRadius: 10, padding: 22, textAlign: "center", color: T.textFaint, fontSize: 12.5 }}><Upload size={18} style={{ marginBottom: 6 }} /><div>File uploads wire up to Supabase Storage — see project_request_files table</div></div></Field>
        <Field label="Deadline"><input type="date" style={inputStyle} value={form.deadline} onChange={set("deadline")} /></Field>

        <Button icon={Send} onClick={submit} disabled={busy || !form.name || !form.client_name} style={{ marginTop: 6 }}>{busy ? "Submitting…" : "Submit to FAR Tech"}</Button>
      </Card>
    </div>
  );
}

/* ---------------------------------- Assignment actions ---------------------------------- */

function AssignmentBar({ profile, project, onUpdated }) {
  const [candidates, setCandidates] = useState([]);
  const [busy, setBusy] = useState(false);

  const stage = !project.project_manager_id ? "pm" : !project.team_lead_id ? "tl" : "dev";
  const canAssignPM = isAdminLevel(profile) && stage === "pm";
  const canAssignTL = profile.far_tech_role === "project_manager" && project.project_manager_id === profile.id && stage === "tl";
  const canAssignDev = profile.far_tech_role === "team_lead" && project.team_lead_id === profile.id;

  useEffect(() => {
    if (canAssignPM) supabase.from("profiles").select("id, full_name").eq("user_type", "far_tech").eq("far_tech_role", "project_manager").then(({ data }) => setCandidates(data || []));
    else if (canAssignTL) supabase.from("profiles").select("id, full_name").eq("user_type", "far_tech").eq("far_tech_role", "team_lead").then(({ data }) => setCandidates(data || []));
    else if (canAssignDev) supabase.from("profiles").select("id, full_name").eq("user_type", "far_tech").eq("far_tech_role", "developer").then(({ data }) => setCandidates(data || []));
  }, [canAssignPM, canAssignTL, canAssignDev]);

  async function assignPmOrTl(field, profileId) {
    setBusy(true);
    const { error } = await supabase.from("projects").update({ [field]: profileId, status: field === "project_manager_id" ? "planning" : project.status }).eq("id", project.id);
    setBusy(false);
    if (!error) onUpdated();
  }

  async function assignDev(profileId) {
    setBusy(true);
    const { error } = await supabase.from("project_team_members").insert({ project_id: project.id, profile_id: profileId, role_on_project: "Developer", assigned_by: profile.id });
    setBusy(false);
    if (!error) onUpdated();
  }

  if (!canAssignPM && !canAssignTL && !canAssignDev) return null;

  return (
    <Card style={{ padding: 16, marginBottom: 18, display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ fontSize: 12.5, color: T.textDim, fontWeight: 600 }}>
        {canAssignPM && "Assign a Project Manager to start this project:"}
        {canAssignTL && "Assign a Team Lead:"}
        {canAssignDev && "Add a Developer to the team:"}
      </div>
      <select style={{ ...inputStyle, width: "auto", flex: 1 }} disabled={busy} defaultValue=""
        onChange={e => {
          if (!e.target.value) return;
          if (canAssignPM) assignPmOrTl("project_manager_id", e.target.value);
          else if (canAssignTL) assignPmOrTl("team_lead_id", e.target.value);
          else assignDev(e.target.value);
        }}>
        <option value="" disabled>Select person…</option>
        {candidates.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
      </select>
    </Card>
  );
}

/* ---------------------------------- Project detail ---------------------------------- */

function ProjectDetail({ project: initial, profile, onBack }) {
  const [project, setProject] = useState(initial);
  const [tab, setTab] = useState("discussion");
  const allowedChannels = channelsFor(profile);
  const [channel, setChannel] = useState(allowedChannels[0]);
  const [msgs, setMsgs] = useState([]);
  const [draft, setDraft] = useState("");
  const [modules, setModules] = useState([]);
  const [files, setFiles] = useState([]);

  const tabs = [
    { key: "discussion", label: "Discussion", icon: MessageSquare },
    { key: "tasks", label: "Tasks", icon: ListChecks },
    { key: "files", label: "Files", icon: FileText },
    { key: "approvals", label: "Approvals", icon: FileCheck2 },
    { key: "time", label: "Time Tracking", icon: Clock },
    { key: "release", label: "Release", icon: Rocket },
  ];

  const refreshProject = useCallback(async () => {
    const { data } = await supabase.from("projects").select("*, agencies(name)").eq("id", project.id).single();
    if (data) setProject(data);
  }, [project.id]);

  useEffect(() => {
    if (tab !== "discussion" || !channel) return;
    supabase.from("messages").select("*, profiles(full_name)").eq("project_id", project.id).eq("channel", channel).order("created_at").then(({ data }) => setMsgs(data || []));

    const sub = supabase.channel(`messages-${project.id}-${channel}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `project_id=eq.${project.id}` }, (payload) => {
        if (payload.new.channel === channel) {
          supabase.from("profiles").select("full_name").eq("id", payload.new.author_id).single().then(({ data }) => {
            setMsgs(prev => [...prev, { ...payload.new, profiles: data }]);
          });
        }
      }).subscribe();
    return () => supabase.removeChannel(sub);
  }, [tab, channel, project.id]);

  useEffect(() => {
    if (tab !== "tasks") return;
    supabase.from("modules").select("*, tasks(*, profiles(full_name))").eq("project_id", project.id).order("sort_order").then(({ data }) => setModules(data || []));
  }, [tab, project.id]);

  useEffect(() => {
    if (tab !== "files") return;
    supabase.from("files").select("*, profiles(full_name)").eq("project_id", project.id).then(({ data }) => setFiles(data || []));
  }, [tab, project.id]);

  async function send() {
    if (!draft.trim() || !channel) return;
    const { error } = await supabase.from("messages").insert({ project_id: project.id, channel, author_id: profile.id, body: draft });
    if (!error) setDraft("");
  }

  return (
    <div>
      <div onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, color: T.textDim, fontSize: 12.5, cursor: "pointer", marginBottom: 14 }}><ArrowLeft size={14} /> Back to projects</div>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 21, fontWeight: 700, color: T.text }}>{project.name}</div>
          <div style={{ fontSize: 12.5, color: T.textFaint, marginTop: 4 }}>{project.agencies?.name} · {project.client_name} · {project.development_type}</div>
        </div>
        <Pill color={STATUS_META[project.status]?.color || T.textDim}>{STATUS_META[project.status]?.label || project.status}</Pill>
      </div>

      <AssignmentBar profile={profile} project={project} onUpdated={refreshProject} />

      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${T.border}`, marginBottom: 20 }}>
        {tabs.map(t => (
          <div key={t.key} onClick={() => setTab(t.key)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 14px", cursor: "pointer", fontSize: 12.8, fontWeight: 600, color: tab === t.key ? T.iceMid : T.textFaint, borderBottom: tab === t.key ? `2px solid ${T.iceMid}` : "2px solid transparent" }}>
            <t.icon size={14} />{t.label}
          </div>
        ))}
      </div>

      {tab === "discussion" && (
        <Card style={{ padding: 0, display: "flex", flexDirection: "column", height: 460 }}>
          {allowedChannels.length > 1 && (
            <div style={{ display: "flex", gap: 4, padding: "10px 14px", borderBottom: `1px solid ${T.borderSoft}` }}>
              {allowedChannels.map(c => (
                <div key={c} onClick={() => setChannel(c)} style={{ padding: "6px 12px", borderRadius: 8, fontSize: 11.5, fontWeight: 600, cursor: "pointer", background: channel === c ? T.panel2 : "transparent", color: channel === c ? T.text : T.textFaint }}>{CHANNEL_LABEL[c]}</div>
              ))}
            </div>
          )}
          <div style={{ flex: 1, overflowY: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
            {msgs.map(m => (
              <div key={m.id} style={{ display: "flex", gap: 10 }}>
                <Avatar name={m.profiles?.full_name} size={30} />
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                    <span style={{ fontSize: 12.8, fontWeight: 700, color: T.text }}>{m.profiles?.full_name}</span>
                    <span style={{ fontSize: 10.5, color: T.textFaint }}>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <div style={{ fontSize: 13, color: T.textDim, marginTop: 4, lineHeight: 1.5 }}>{m.body}</div>
                </div>
              </div>
            ))}
            {msgs.length === 0 && <div style={{ fontSize: 12.5, color: T.textFaint }}>No messages yet — start the conversation.</div>}
          </div>
          <div style={{ borderTop: `1px solid ${T.border}`, padding: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <Paperclip size={16} color={T.textFaint} />
            <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder={`Message ${CHANNEL_LABEL[channel] || ""}…`} style={{ ...inputStyle, flex: 1 }} />
            <Button icon={Send} onClick={send}>Send</Button>
          </div>
        </Card>
      )}

      {tab === "tasks" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {modules.length === 0 && <Card style={{ padding: 30, textAlign: "center", color: T.textFaint, fontSize: 12.5 }}>No modules yet.</Card>}
          {modules.map(mod => (
            <Card key={mod.id} style={{ padding: 18 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}><LayoutGrid size={15} color={T.iceMid} /> {mod.name}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(mod.tasks || []).map(t => (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", background: T.panel2, borderRadius: 9 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>{TASK_STATUS_ICON[t.status]}<span style={{ fontSize: 12.8, color: T.text }}>{t.title}</span></div>
                    <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 11.3, color: T.textFaint }}>
                      <span>{t.estimated_hours}h</span><span style={{ textTransform: "capitalize" }}>{t.priority}</span><span>{t.deadline}</span>
                      <Avatar name={t.profiles?.full_name} size={22} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {tab === "files" && (
        <Card style={{ overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: T.panel2 }}>{["File", "Category", "Version", "Uploaded by", ""].map(h => <th key={h} style={{ padding: "10px 16px", fontSize: 11, color: T.textFaint, textAlign: "left" }}>{h}</th>)}</tr></thead>
            <tbody>
              {files.map(f => (
                <tr key={f.id} style={{ borderTop: `1px solid ${T.borderSoft}` }}>
                  <td style={{ padding: "11px 16px", fontSize: 12.8, color: T.text, display: "flex", alignItems: "center", gap: 8 }}><FileText size={14} color={T.iceMid} /> {f.name}</td>
                  <td style={{ padding: "11px 16px", fontSize: 12, color: T.textDim, textTransform: "capitalize" }}>{f.category}</td>
                  <td style={{ padding: "11px 16px", fontSize: 12, color: T.textDim }}>v{f.current_version}</td>
                  <td style={{ padding: "11px 16px", fontSize: 12, color: T.textDim }}>{f.profiles?.full_name}</td>
                  <td style={{ padding: "11px 16px" }}><Download size={14} color={T.textFaint} /></td>
                </tr>
              ))}
              {files.length === 0 && <tr><td colSpan={5} style={{ padding: 20, color: T.textFaint, fontSize: 12.5 }}>No files uploaded yet.</td></tr>}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "approvals" && <ApprovalsTab project={project} profile={profile} />}
      {tab === "time" && <TimeTab project={project} profile={profile} />}
      {tab === "release" && <ReleaseTab project={project} profile={profile} />}
    </div>
  );
}

function ApprovalsTab({ project, profile }) {
  const [approvals, setApprovals] = useState([]);
  useEffect(() => { supabase.from("approvals").select("*").eq("project_id", project.id).then(({ data }) => setApprovals(data || [])); }, [project.id]);

  async function decide(id, decision) {
    const { error } = await supabase.from("approvals").update({ decision, reviewed_by: profile.id, decided_at: new Date().toISOString() }).eq("id", id);
    if (!error) setApprovals(approvals.map(a => a.id === id ? { ...a, decision } : a));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {approvals.length === 0 && <Card style={{ padding: 24, textAlign: "center", color: T.textFaint, fontSize: 12.5 }}>No approvals submitted yet.</Card>}
      {approvals.map(a => (
        <Card key={a.id} style={{ padding: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.text, textTransform: "capitalize" }}>{a.stage.replace("_", " ")}</div>
            <div style={{ fontSize: 11.5, color: T.textFaint }}>Submitted {new Date(a.submitted_at).toLocaleDateString()}</div>
          </div>
          {profile.user_type === "agency" && a.decision === "pending" ? (
            <div style={{ display: "flex", gap: 8 }}>
              <Button icon={CheckCircle2} onClick={() => decide(a.id, "approved")}>Approve</Button>
              <Button variant="danger" onClick={() => decide(a.id, "changes_requested")}>Request Changes</Button>
            </div>
          ) : (
            <Pill color={a.decision === "approved" ? T.green : a.decision === "pending" ? T.amber : T.red}>{a.decision.replace("_", " ")}</Pill>
          )}
        </Card>
      ))}
    </div>
  );
}

function TimeTab({ project, profile }) {
  const [entries, setEntries] = useState([]);
  const [running, setRunning] = useState(null);
  const isDeveloper = profile.far_tech_role === "developer";

  const load = useCallback(() => {
    supabase.from("time_entries").select("*").eq("project_id", project.id).order("started_at", { ascending: false }).then(({ data }) => {
      setEntries(data || []);
      setRunning((data || []).find(e => e.developer_id === profile.id && !e.ended_at) || null);
    });
  }, [project.id, profile.id]);
  useEffect(load, [load]);

  async function start() {
    const { error } = await supabase.from("time_entries").insert({ project_id: project.id, developer_id: profile.id, started_at: new Date().toISOString() });
    if (!error) load();
  }
  async function stop() {
    const { error } = await supabase.from("time_entries").update({ ended_at: new Date().toISOString() }).eq("id", running.id);
    if (!error) load();
  }

  const totalMinutes = entries.reduce((a, e) => a + (e.duration_minutes || 0), 0);

  return (
    <Card style={{ padding: 22 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 13, color: T.textDim }}>Total logged</div>
          <div style={{ fontFamily: FONT_DISPLAY, fontSize: 26, fontWeight: 700, color: T.text }}>{Math.floor(totalMinutes / 60)}h {totalMinutes % 60}m</div>
        </div>
        {isDeveloper && (running
          ? <Button variant="danger" icon={Square} onClick={stop}>Stop Timer</Button>
          : <Button icon={Play} onClick={start}>Start Timer</Button>)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {entries.map(e => (
          <div key={e.id} style={{ display: "flex", justifyContent: "space-between", padding: "9px 12px", background: T.panel2, borderRadius: 9, fontSize: 12.3, color: T.textDim }}>
            <span>{new Date(e.started_at).toLocaleString()}</span>
            <span>{e.ended_at ? `${e.duration_minutes} min` : "In progress…"}</span>
          </div>
        ))}
        {entries.length === 0 && <div style={{ fontSize: 12.5, color: T.textFaint }}>No time logged yet.</div>}
      </div>
    </Card>
  );
}

function ReleaseTab({ project, profile }) {
  const [releases, setReleases] = useState([]);
  useEffect(() => { supabase.from("releases").select("*").eq("project_id", project.id).order("created_at", { ascending: false }).then(({ data }) => setReleases(data || [])); }, [project.id]);

  async function decide(id, status) {
    const { error } = await supabase.from("releases").update({ status, decided_by: profile.id, decided_at: new Date().toISOString() }).eq("id", id);
    if (!error) setReleases(releases.map(r => r.id === id ? { ...r, status } : r));
  }

  if (releases.length === 0) return <Card style={{ padding: 24, textAlign: "center", color: T.textFaint, fontSize: 12.5 }}>No releases yet.</Card>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {releases.map(r => (
        <Card key={r.id} style={{ padding: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <PackageCheck size={20} color={T.iceMid} />
            <div style={{ fontFamily: FONT_DISPLAY, fontSize: 15.5, fontWeight: 700, color: T.text }}>{r.version_label}</div>
            <Pill color={r.status === "approved" || r.status === "deployed" ? T.green : r.status === "changes_requested" ? T.red : T.amber}>{r.status.replace("_", " ")}</Pill>
          </div>
          <div style={{ fontSize: 12.5, color: T.textDim, marginBottom: 14 }}>{r.release_notes}</div>
          {profile.user_type === "agency" && r.status === "pending_approval" && (
            <div style={{ display: "flex", gap: 10 }}>
              <Button icon={CheckCircle2} onClick={() => decide(r.id, "approved")}>Approve Release</Button>
              <Button variant="danger" onClick={() => decide(r.id, "changes_requested")}>Request Changes</Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

/* ---------------------------------- Simple list views ---------------------------------- */

function InvoicesView({ profile }) {
  const [invoices, setInvoices] = useState(null);
  useEffect(() => { supabase.from("invoices").select("*, agencies(name), projects(name)").order("created_at", { ascending: false }).then(({ data }) => setInvoices(data || [])); }, []);
  if (!invoices) return <Spinner />;
  const statusColor = { paid: T.green, pending: T.amber, overdue: T.red, draft: T.textDim, cancelled: T.textFaint };
  return (
    <div>
      <SectionTitle>Invoices</SectionTitle>
      <Card style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ background: T.panel2 }}>{["Invoice #", isAdminLevel(profile) ? "Agency" : null, "Project", "Amount", "Due", "Status"].filter(Boolean).map(h => <th key={h} style={{ padding: "10px 16px", fontSize: 11, color: T.textFaint, textAlign: "left" }}>{h}</th>)}</tr></thead>
          <tbody>
            {invoices.map(i => (
              <tr key={i.id} style={{ borderTop: `1px solid ${T.borderSoft}` }}>
                <td style={{ padding: "12px 16px", fontSize: 12.8, color: T.text, fontWeight: 600 }}>{i.invoice_number}</td>
                {isAdminLevel(profile) && <td style={{ padding: "12px 16px", fontSize: 12.5, color: T.textDim }}>{i.agencies?.name}</td>}
                <td style={{ padding: "12px 16px", fontSize: 12.5, color: T.textDim }}>{i.projects?.name}</td>
                <td style={{ padding: "12px 16px", fontSize: 12.8, color: T.text }}>${Number(i.amount).toLocaleString()}</td>
                <td style={{ padding: "12px 16px", fontSize: 12.5, color: T.textDim }}>{i.due_date}</td>
                <td style={{ padding: "12px 16px" }}><Pill color={statusColor[i.status]}>{i.status}</Pill></td>
              </tr>
            ))}
            {invoices.length === 0 && <tr><td colSpan={6} style={{ padding: 20, color: T.textFaint, fontSize: 12.5 }}>No invoices yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function TicketsView({ profile }) {
  const [tickets, setTickets] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ category: "bug", priority: "medium", subject: "", description: "" });

  const load = useCallback(() => { supabase.from("support_tickets").select("*, agencies(name)").order("created_at", { ascending: false }).then(({ data }) => setTickets(data || [])); }, []);
  useEffect(load, [load]);

  async function submitTicket() {
    const { error } = await supabase.from("support_tickets").insert({ ...form, agency_id: profile.agency_id, raised_by: profile.id });
    if (!error) { setShowNew(false); setForm({ category: "bug", priority: "medium", subject: "", description: "" }); load(); }
  }

  if (!tickets) return <Spinner />;
  const prColor = { low: T.textDim, medium: T.iceMid, high: T.amber, urgent: T.red };
  return (
    <div>
      <SectionTitle action={profile.user_type === "agency" && <Button icon={Plus} onClick={() => setShowNew(!showNew)}>New Ticket</Button>}>Support tickets</SectionTitle>
      {showNew && (
        <Card style={{ padding: 18, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="Category"><select style={inputStyle} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}><option value="bug">Bug</option><option value="feature">Feature</option><option value="emergency">Emergency</option><option value="server">Server</option><option value="maintenance">Maintenance</option></select></Field>
            <Field label="Priority"><select style={inputStyle} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></Field>
          </div>
          <Field label="Subject"><input style={inputStyle} value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} /></Field>
          <Field label="Description"><textarea rows={3} style={{ ...inputStyle, resize: "vertical" }} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
          <Button icon={Send} onClick={submitTicket} disabled={!form.subject}>Submit ticket</Button>
        </Card>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {tickets.map(t => (
          <Card key={t.id} style={{ padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{t.subject}</div>
              <div style={{ fontSize: 11.5, color: T.textFaint, marginTop: 3 }}>{isAdminLevel(profile) ? t.agencies?.name + " · " : ""}{t.category}</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Pill color={prColor[t.priority]}>{t.priority}</Pill>
              <Pill color={t.status === "open" ? T.red : t.status === "resolved" || t.status === "closed" ? T.green : T.amber}>{t.status.replace("_", " ")}</Pill>
            </div>
          </Card>
        ))}
        {tickets.length === 0 && <div style={{ fontSize: 12.5, color: T.textFaint }}>No tickets yet.</div>}
      </div>
    </div>
  );
}

function MeetingsView({ profile }) {
  const [meetings, setMeetings] = useState(null);
  useEffect(() => { supabase.from("meetings").select("*, agencies(name)").order("meeting_date", { ascending: true }).then(({ data }) => setMeetings(data || [])); }, []);
  if (!meetings) return <Spinner />;
  return (
    <div>
      <SectionTitle action={<Button icon={Plus}>Schedule Meeting</Button>}>Meetings</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14 }}>
        {meetings.map(m => (
          <Card key={m.id} style={{ padding: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: T.iceMid + "1A", display: "flex", alignItems: "center", justifyContent: "center" }}><Video size={17} color={T.iceMid} /></div>
              <div><div style={{ fontSize: 13.3, fontWeight: 700, color: T.text }}>{m.title}</div><div style={{ fontSize: 11.5, color: T.textFaint }}>{m.agencies?.name}</div></div>
            </div>
            <div style={{ fontSize: 12.3, color: T.textDim }}>{m.meeting_date} · {m.meeting_time} · {m.platform.replace("_", " ")}</div>
          </Card>
        ))}
        {meetings.length === 0 && <div style={{ fontSize: 12.5, color: T.textFaint }}>No meetings scheduled.</div>}
      </div>
    </div>
  );
}

function InviteEmployeeForm({ onClose, onInvited }) {
  const [form, setForm] = useState({ email: "", fullName: "", farTechRole: "developer", department: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function invite() {
    setBusy(true); setErr(null);
    const { error } = await callEdgeFunction("invite-team-member", form);
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onInvited(); onClose();
  }

  return (
    <Card style={{ padding: 18, marginBottom: 16 }}>
      <SectionTitle action={<X size={17} color={T.textFaint} style={{ cursor: "pointer" }} onClick={onClose} />}>Invite a FAR Tech employee</SectionTitle>
      <ErrorBox message={err} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field label="Full name"><input style={inputStyle} value={form.fullName} onChange={set("fullName")} /></Field>
        <Field label="Email"><input style={inputStyle} type="email" value={form.email} onChange={set("email")} /></Field>
        <Field label="Permission level">
          <select style={inputStyle} value={form.farTechRole} onChange={set("farTechRole")}>
            <option value="admin">Admin</option>
            <option value="project_manager">Project Manager</option>
            <option value="team_lead">Team Lead</option>
            <option value="developer">Developer</option>
          </select>
        </Field>
        <Field label="Department / title (optional)"><input style={inputStyle} value={form.department} onChange={set("department")} placeholder="e.g. QA Engineer, Sales, HR" /></Field>
      </div>
      <Button icon={UserPlus} onClick={invite} disabled={busy || !form.email || !form.fullName}>{busy ? "Sending invite…" : "Send invite"}</Button>
    </Card>
  );
}

function EmployeesView() {
  const [team, setTeam] = useState(null);
  const [showInvite, setShowInvite] = useState(false);
  const load = useCallback(() => { supabase.from("profiles").select("*").eq("user_type", "far_tech").then(({ data }) => setTeam(data || [])); }, []);
  useEffect(load, [load]);
  if (!team) return <Spinner />;
  return (
    <div>
      <SectionTitle action={<Button icon={UserPlus} onClick={() => setShowInvite(true)}>Invite Employee</Button>}>FAR Tech employees</SectionTitle>
      {showInvite && <InviteEmployeeForm onClose={() => setShowInvite(false)} onInvited={load} />}
      <Card style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ background: T.panel2 }}>{["Name", "Role", "Department", ""].map(h => <th key={h} style={{ padding: "10px 16px", fontSize: 11, color: T.textFaint, textAlign: "left" }}>{h}</th>)}</tr></thead>
          <tbody>
            {team.map(t => (
              <tr key={t.id} style={{ borderTop: `1px solid ${T.borderSoft}` }}>
                <td style={{ padding: "11px 16px", display: "flex", alignItems: "center", gap: 10, fontSize: 12.8, color: T.text }}><Avatar name={t.full_name} size={28} />{t.full_name}</td>
                <td style={{ padding: "11px 16px", fontSize: 12.3, color: T.textDim, textTransform: "capitalize" }}>{t.far_tech_role?.replace("_", " ")}</td>
                <td style={{ padding: "11px 16px", fontSize: 12.3, color: T.textDim }}>{t.department || "—"}</td>
                <td style={{ padding: "11px 16px" }}><MoreHorizontal size={15} color={T.textFaint} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function TeamView({ profile }) {
  const [members, setMembers] = useState(null);
  useEffect(() => {
    if (profile.user_type === "agency") {
      supabase.from("profiles").select("*").eq("agency_id", profile.agency_id).then(({ data }) => setMembers(data || []));
    } else {
      supabase.from("project_team_members").select("profiles(*)").then(({ data }) => setMembers((data || []).map(d => d.profiles)));
    }
  }, [profile]);
  if (!members) return <Spinner />;
  return (
    <div>
      <SectionTitle action={profile.user_type === "agency" && <Button icon={UserPlus}>Invite Member</Button>}>Team</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14 }}>
        {members.map(m => (
          <Card key={m.id} style={{ padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
            <Avatar name={m.full_name} size={38} />
            <div><div style={{ fontSize: 13.3, fontWeight: 600, color: T.text }}>{m.full_name}</div><div style={{ fontSize: 11.5, color: T.textFaint, textTransform: "capitalize" }}>{(m.agency_role || m.far_tech_role || "").replace("_", " ")}</div></div>
          </Card>
        ))}
        {members.length === 0 && <div style={{ fontSize: 12.5, color: T.textFaint }}>No team members yet.</div>}
      </div>
    </div>
  );
}

function ReportsView() {
  const [counts, setCounts] = useState(null);
  useEffect(() => {
    (async () => {
      const [{ count: completed }, { count: inProgress }] = await Promise.all([
        supabase.from("projects").select("*", { count: "exact", head: true }).in("status", ["completed", "released"]),
        supabase.from("projects").select("*", { count: "exact", head: true }).not("status", "in", "(completed,released,cancelled)"),
      ]);
      setCounts({ completed, inProgress });
    })();
  }, []);
  if (!counts) return <Spinner />;
  return (
    <div>
      <SectionTitle>Reports</SectionTitle>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <StatCard icon={FolderKanban} label="Completed" value={counts.completed} accent={T.green} />
        <StatCard icon={Clock} label="In progress" value={counts.inProgress} accent={T.blue} />
      </div>
    </div>
  );
}

function ActivityLogView() {
  const [logs, setLogs] = useState(null);
  useEffect(() => { supabase.from("activity_logs").select("*, profiles(full_name)").order("created_at", { ascending: false }).limit(50).then(({ data }) => setLogs(data || [])); }, []);
  if (!logs) return <Spinner />;
  return (
    <div>
      <SectionTitle>Audit logs</SectionTitle>
      <Card style={{ padding: 20 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {logs.map(a => (
            <div key={a.id} style={{ display: "flex", gap: 10 }}>
              <div style={{ width: 6, height: 6, borderRadius: 2, background: T.iceMid, marginTop: 6, flexShrink: 0, transform: "rotate(45deg)" }} />
              <div><div style={{ fontSize: 12.8, color: T.text }}>{a.profiles?.full_name} — {a.action}</div><div style={{ fontSize: 11, color: T.textFaint, marginTop: 2 }}>{new Date(a.created_at).toLocaleString()}</div></div>
            </div>
          ))}
          {logs.length === 0 && <div style={{ fontSize: 12.5, color: T.textFaint }}>No activity recorded yet.</div>}
        </div>
      </Card>
    </div>
  );
}

function FilesView({ profile }) {
  const [files, setFiles] = useState(null);
  useEffect(() => { supabase.from("files").select("*, projects(name)").then(({ data }) => setFiles(data || [])); }, [profile]);
  if (!files) return <Spinner />;
  return (
    <div>
      <SectionTitle>Files</SectionTitle>
      <Card style={{ overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ background: T.panel2 }}>{["File", "Project", "Category", "Version"].map(h => <th key={h} style={{ padding: "10px 16px", fontSize: 11, color: T.textFaint, textAlign: "left" }}>{h}</th>)}</tr></thead>
          <tbody>
            {files.map(f => (
              <tr key={f.id} style={{ borderTop: `1px solid ${T.borderSoft}` }}>
                <td style={{ padding: "11px 16px", fontSize: 12.6, color: T.text, display: "flex", alignItems: "center", gap: 8 }}><FileText size={14} color={T.iceMid} />{f.name}</td>
                <td style={{ padding: "11px 16px", fontSize: 12, color: T.textDim }}>{f.projects?.name}</td>
                <td style={{ padding: "11px 16px", fontSize: 12, color: T.textDim, textTransform: "capitalize" }}>{f.category}</td>
                <td style={{ padding: "11px 16px", fontSize: 12, color: T.textDim }}>v{f.current_version}</td>
              </tr>
            ))}
            {files.length === 0 && <tr><td colSpan={4} style={{ padding: 20, color: T.textFaint, fontSize: 12.5 }}>No files yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function SettingsView() {
  return (
    <div>
      <SectionTitle>Settings</SectionTitle>
      <Card style={{ padding: 22, maxWidth: 560 }}>
        <div style={{ fontSize: 12.5, color: T.textFaint }}>Platform-wide settings (support email, default currency, SOP version) — wire to a `settings` key/value table when needed.</div>
      </Card>
    </div>
  );
}

/* ---------------------------------- Root App ---------------------------------- */

function AppShell({ profile, refreshProfile }) {
  const needsOnboarding = profile.user_type === "agency" && (profile.agencies?.onboarding_progress ?? 0) < 100;
  const [view, setView] = useState(needsOnboarding ? "onboarding" : "dashboard");
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedAgency, setSelectedAgency] = useState(null);

  const goProject = (p) => { setSelectedProject(p); setView("projects"); };
  const changeView = (v) => { setView(v); setSelectedProject(null); setSelectedAgency(null); };

  const nav = navFor(profile);
  let title = nav.find(n => n.key === view)?.label || "Dashboard";
  if (selectedProject && view === "projects") title = selectedProject.name;
  if (selectedAgency && view === "agencies") title = selectedAgency.name;

  let content;
  if (view === "onboarding") content = <AgencyOnboardingFlow profile={profile} onFinished={() => { refreshProfile(); changeView("dashboard"); }} />;
  else if (view === "dashboard") content = <Dashboard profile={profile} goProjects={() => changeView("projects")} goAgencies={() => changeView("agencies")} goProject={goProject} />;
  else if (view === "agencies") content = selectedAgency ? <AgencyDetail agency={selectedAgency} onBack={() => setSelectedAgency(null)} goProject={goProject} /> : <AgenciesView onOpenAgency={setSelectedAgency} />;
  else if (view === "projects") content = selectedProject ? <ProjectDetail project={selectedProject} profile={profile} onBack={() => setSelectedProject(null)} /> : <ProjectsList profile={profile} goProject={goProject} goNew={() => changeView("newProject")} />;
  else if (view === "newProject") content = <NewProjectForm profile={profile} onCreated={() => changeView("projects")} />;
  else if (view === "files") content = <FilesView profile={profile} />;
  else if (view === "invoices") content = <InvoicesView profile={profile} />;
  else if (view === "team") content = <TeamView profile={profile} />;
  else if (view === "meetings") content = <MeetingsView profile={profile} />;
  else if (view === "tickets") content = <TicketsView profile={profile} />;
  else if (view === "reports") content = <ReportsView profile={profile} />;
  else if (view === "employees") content = <EmployeesView />;
  else if (view === "activity") content = <ActivityLogView />;
  else if (view === "settings") content = <SettingsView />;

  if (view === "onboarding") return content;

  return (
    <div style={{ fontFamily: FONT_BODY, background: T.bg, height: "100vh", display: "flex", color: T.text }}>
      <style>{injectFonts}</style>
      <Sidebar profile={profile} view={view} setView={changeView} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Topbar title={title} />
        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>{content}</div>
      </div>
    </div>
  );
}

export default function App() {
  const { session, profile, loading, profileError, refreshProfile } = useSession();
  const [needsPassword, setNeedsPassword] = useState(() => window.location.hash.includes("type=invite") || window.location.hash.includes("type=signup"));

  if (loading) {
    return <div style={{ height: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center" }}><Spinner label="Loading…" /></div>;
  }
  if (!session) return <LoginScreen />;
  if (needsPassword) return <SetPasswordScreen onDone={() => setNeedsPassword(false)} />;
  if (profileError || !profile) {
    return (
      <div style={{ height: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT_BODY, color: T.text, flexDirection: "column", gap: 10 }}>
        <style>{injectFonts}</style>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Your account isn't fully set up yet</div>
        <div style={{ fontSize: 12.5, color: T.textFaint, maxWidth: 360, textAlign: "center" }}>You're signed in, but no profile record was found. Ask a FAR Tech admin to complete your invite, or check with them if this persists.</div>
        <Button variant="ghost" onClick={signOut} style={{ marginTop: 10 }}>Sign out</Button>
      </div>
    );
  }
  return <AppShell profile={profile} refreshProfile={refreshProfile} />;
}
