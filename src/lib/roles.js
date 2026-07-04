// Central place that encodes the permission hierarchy from the architecture
// doc. Mirrors the RLS logic in supabase_schema_v2.sql — this file controls
// what's *shown*, RLS controls what's actually *fetchable*. Keep both in sync.

import {
  Home, Building2, FolderKanban, Users, Receipt, Ticket as TicketIcon,
  Calendar, BarChart3, ClipboardList, Settings as SettingsIcon, FileText,
  Plus, ListChecks,
} from "lucide-react";

// far_tech_role values: super_admin, admin, project_manager, team_lead, developer
// agency_role values:   owner, manager, staff

export function roleLabel(profile) {
  if (!profile) return "";
  if (profile.user_type === "far_tech") {
    return { super_admin: "Super Admin", admin: "Admin", project_manager: "Project Manager", team_lead: "Team Lead", developer: "Developer" }[profile.far_tech_role];
  }
  return { owner: "Agency Owner", manager: "Agency Manager", staff: "Agency Staff" }[profile.agency_role];
}

export function isAdminLevel(profile) {
  return profile?.user_type === "far_tech" && ["super_admin", "admin"].includes(profile.far_tech_role);
}

export function navFor(profile) {
  if (!profile) return [];

  if (profile.user_type === "agency") {
    // Agency doc: Can create client/project, upload docs, view progress,
    // approve deliverables, tickets, invoices, chat with PM. Cannot assign
    // developers/team leads or see other agencies/internal discussions.
    return [
      { key: "dashboard", label: "Dashboard", icon: Home },
      { key: "onboarding", label: "Getting Started", icon: Plus },
      { key: "projects", label: "My Projects", icon: FolderKanban },
      { key: "newProject", label: "New Project", icon: Plus },
      { key: "files", label: "Files", icon: FileText },
      { key: "invoices", label: "Invoices", icon: Receipt },
      { key: "team", label: "Team", icon: Users },
      { key: "meetings", label: "Meetings", icon: Calendar },
      { key: "tickets", label: "Support", icon: TicketIcon },
      { key: "reports", label: "Reports", icon: BarChart3 },
    ];
  }

  switch (profile.far_tech_role) {
    case "super_admin":
    case "admin":
      return [
        { key: "dashboard", label: "Dashboard", icon: Home },
        { key: "agencies", label: "Agencies", icon: Building2 },
        { key: "projects", label: "Projects", icon: FolderKanban },
        { key: "employees", label: "Employees", icon: Users },
        { key: "invoices", label: "Invoices", icon: Receipt },
        { key: "tickets", label: "Tickets", icon: TicketIcon },
        { key: "meetings", label: "Meetings", icon: Calendar },
        { key: "reports", label: "Reports", icon: BarChart3 },
        { key: "activity", label: "Audit Logs", icon: ClipboardList },
        { key: "settings", label: "Settings", icon: SettingsIcon },
      ];
    case "project_manager":
      // Doc: PM creates projects, assigns TL, creates tasks, reviews work,
      // chats with agency/TL/dev, closes projects. Cannot access other PMs'
      // projects. Invoices: view only. No Agencies list, no Audit Logs.
      return [
        { key: "dashboard", label: "Dashboard", icon: Home },
        { key: "projects", label: "My Projects", icon: FolderKanban },
        { key: "team", label: "Team", icon: Users },
        { key: "invoices", label: "Invoices (view)", icon: Receipt },
        { key: "meetings", label: "Meetings", icon: Calendar },
        { key: "reports", label: "Reports", icon: BarChart3 },
      ];
    case "team_lead":
      // Doc: receives projects, assigns tasks to developers, reviews code,
      // talks to PM/devs. No agency contact, no invoices, no audit logs.
      return [
        { key: "dashboard", label: "Dashboard", icon: Home },
        { key: "projects", label: "My Projects", icon: FolderKanban },
        { key: "team", label: "My Developers", icon: Users },
        { key: "meetings", label: "Meetings", icon: Calendar },
      ];
    case "developer":
      // Doc: view assigned tasks, update status, upload code/files, submit
      // time, chat with TL/PM only. Narrowest nav of anyone.
      return [
        { key: "dashboard", label: "Dashboard", icon: Home },
        { key: "projects", label: "My Tasks", icon: ListChecks },
      ];
    default:
      return [{ key: "dashboard", label: "Dashboard", icon: Home }];
  }
}

// Which chat channel(s) a role can see inside a project, per the
// Communication Flow diagram (Agency<->PM, PM<->TL<->Dev, Admin<->everyone).
export function channelsFor(profile) {
  if (!profile) return [];
  if (isAdminLevel(profile)) return ["agency_facing", "internal"];
  if (profile.user_type === "agency") return ["agency_facing"];
  if (profile.far_tech_role === "project_manager") return ["agency_facing", "internal"];
  if (["team_lead", "developer"].includes(profile.far_tech_role)) return ["internal"];
  return [];
}

export const CHANNEL_LABEL = {
  agency_facing: "Agency Communication",
  internal: "Internal Team",
};
