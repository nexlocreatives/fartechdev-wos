-- ============================================================================
-- FAR TECH & DEVELOPERS — WHITE LABEL ONBOARDING & OPERATIONS SYSTEM
-- Schema v2 — tiered role hierarchy + scoped RLS + dual-channel chat
-- ============================================================================
-- Run this in the SQL Editor. It's safe to run on your current test project
-- (drops and recreates everything — you have no production data yet).
-- If you ever run this again on a project with real data, back up first:
-- this file starts with `drop schema public cascade`.
-- ============================================================================

drop schema if exists public cascade;
create schema public;
grant all on schema public to postgres, anon, authenticated, service_role;

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ----------------------------------------------------------------------------
-- ENUM TYPES
-- ----------------------------------------------------------------------------
create type agency_status        as enum ('pending', 'active', 'suspended', 'archived');
create type white_label_plan     as enum ('starter', 'growth', 'enterprise');

-- Permission tier ONLY. Job specialty (QA, designer, sales, HR, accounts...)
-- lives in profiles.department as free text — it never affects access.
create type far_tech_role        as enum ('super_admin','admin','project_manager','team_lead','developer');
create type agency_role          as enum ('owner','manager','staff');

create type user_type            as enum ('far_tech','agency');
create type project_status       as enum ('waiting_assignment','planning','development','internal_qa','agency_review','changes_requested','approved','released','completed','on_hold','cancelled');
create type project_priority     as enum ('low','medium','high');
create type development_type     as enum ('web','mobile','saas','ai','ui_ux','shopify','wordpress','custom');
create type task_status          as enum ('todo','in_progress','in_review','done','blocked');
create type approval_stage       as enum ('ready_for_review','pm_review','agency_review','approved','changes_requested','production');
create type approval_decision    as enum ('pending','approved','changes_requested');
create type file_category        as enum ('contract','requirement','design','source','apk','build','video','meeting_notes','other');
create type invoice_status       as enum ('draft','pending','paid','overdue','cancelled');
create type ticket_category      as enum ('bug','feature','emergency','server','maintenance');
create type ticket_status        as enum ('open','in_progress','waiting_on_agency','resolved','closed');
create type ticket_priority      as enum ('low','medium','high','urgent');
create type meeting_platform     as enum ('google_meet','zoom','other');
create type agreement_type       as enum ('nda','master_agreement','sow','amendment');
create type agreement_status     as enum ('draft','sent','signed','expired');
create type release_status       as enum ('pending_approval','approved','changes_requested','deployed');
create type notification_channel as enum ('in_app','email');

-- NEW: chat visibility. agency_facing = Agency <-> PM <-> Admin.
--      internal      = PM <-> Team Lead <-> Developer <-> Admin. Agency never sees this.
create type message_channel      as enum ('agency_facing','internal');

-- ----------------------------------------------------------------------------
-- AGENCIES
-- ----------------------------------------------------------------------------
create table agencies (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  slug               text unique not null,
  contact_person     text not null,
  email              text not null,
  phone              text,
  logo_url           text,
  time_zone          text default 'UTC',
  white_label_plan   white_label_plan not null default 'starter',
  nda_signed         boolean not null default false,
  agreement_signed   boolean not null default false,
  status             agency_status not null default 'pending',
  onboarding_progress int not null default 0 check (onboarding_progress between 0 and 100),
  onboarding_complete boolean generated always as (onboarding_progress >= 100) stored,
  billing_email      text,
  billing_address    text,
  preferred_channel  text,
  created_by         uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index idx_agencies_status on agencies(status);

create table agency_onboarding_steps (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references agencies(id) on delete cascade,
  step_key      text not null,
  label         text not null,
  is_complete   boolean not null default false,
  completed_at  timestamptz,
  unique(agency_id, step_key)
);

-- ----------------------------------------------------------------------------
-- PROFILES
-- ----------------------------------------------------------------------------
create table profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  user_type         user_type not null,
  agency_id         uuid references agencies(id) on delete cascade,
  far_tech_role     far_tech_role,      -- permission tier, set only when user_type = 'far_tech'
  agency_role       agency_role,        -- permission tier, set only when user_type = 'agency'
  department        text,               -- descriptive only: 'QA Engineer','UI/UX Designer','Sales','HR','Accounts', etc. Never used in RLS.
  full_name         text not null,
  email             text not null unique,
  phone             text,
  avatar_url        text,
  is_active         boolean not null default true,
  invited_by        uuid references profiles(id),
  last_login_at     timestamptz,
  created_at        timestamptz not null default now(),
  constraint chk_profile_role check (
    (user_type = 'far_tech' and far_tech_role is not null and agency_id is null) or
    (user_type = 'agency'   and agency_role is not null and agency_id is not null)
  )
);
create index idx_profiles_agency on profiles(agency_id);
create index idx_profiles_user_type on profiles(user_type);
create index idx_profiles_far_tech_role on profiles(far_tech_role);

create table agreements (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references agencies(id) on delete cascade,
  type          agreement_type not null,
  title         text not null,
  file_url      text,
  status        agreement_status not null default 'draft',
  sent_at       timestamptz,
  signed_at     timestamptz,
  expires_at    timestamptz,
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- PROJECTS
-- project_manager_id / team_lead_id drive the assignment chain and RLS scoping:
-- Admin assigns project_manager_id -> PM assigns team_lead_id ->
-- Team Lead assigns developers via project_team_members.
-- ----------------------------------------------------------------------------
create table projects (
  id                 uuid primary key default gen_random_uuid(),
  agency_id          uuid not null references agencies(id) on delete cascade,
  name               text not null,
  client_name        text not null,
  industry           text,
  development_type   development_type not null,
  description        text,
  priority           project_priority not null default 'medium',
  deadline           date,
  status             project_status not null default 'waiting_assignment',
  project_manager_id uuid references profiles(id),
  team_lead_id       uuid references profiles(id),
  requested_by       uuid references profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index idx_projects_agency on projects(agency_id);
create index idx_projects_status on projects(status);
create index idx_projects_pm on projects(project_manager_id);
create index idx_projects_tl on projects(team_lead_id);

create table project_request_files (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  file_url    text not null,
  file_name   text not null,
  uploaded_by uuid references profiles(id),
  created_at  timestamptz not null default now()
);

-- Developers (and any additional QA/designer help) assigned by the Team Lead.
create table project_team_members (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  profile_id  uuid not null references profiles(id) on delete cascade,
  role_on_project text not null,   -- 'Developer','QA','Designer'
  assigned_by uuid references profiles(id),   -- audit: who made this assignment
  assigned_at timestamptz not null default now(),
  unique(project_id, profile_id)
);

-- ----------------------------------------------------------------------------
-- MODULES + TASKS
-- ----------------------------------------------------------------------------
create table modules (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  name        text not null,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create table tasks (
  id               uuid primary key default gen_random_uuid(),
  module_id        uuid not null references modules(id) on delete cascade,
  project_id       uuid not null references projects(id) on delete cascade,
  title            text not null,
  description      text,
  assigned_to      uuid references profiles(id),
  estimated_hours  numeric(6,2),
  priority         project_priority not null default 'medium',
  deadline         date,
  status           task_status not null default 'todo',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index idx_tasks_project on tasks(project_id);
create index idx_tasks_assigned on tasks(assigned_to);

-- ----------------------------------------------------------------------------
-- MESSAGES — dual channel
-- ----------------------------------------------------------------------------
create table messages (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id) on delete cascade,
  channel         message_channel not null default 'agency_facing',
  parent_id       uuid references messages(id) on delete cascade,
  author_id       uuid not null references profiles(id),
  body            text,
  is_voice_note   boolean not null default false,
  voice_note_url  text,
  created_at      timestamptz not null default now(),
  edited_at       timestamptz
);
create index idx_messages_project on messages(project_id, channel);
create index idx_messages_parent on messages(parent_id);

create table message_attachments (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references messages(id) on delete cascade,
  file_url    text not null,
  file_name   text not null,
  file_type   text,
  created_at  timestamptz not null default now()
);

create table message_mentions (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references messages(id) on delete cascade,
  profile_id  uuid not null references profiles(id) on delete cascade
);

create table message_reactions (
  id          uuid primary key default gen_random_uuid(),
  message_id  uuid not null references messages(id) on delete cascade,
  profile_id  uuid not null references profiles(id) on delete cascade,
  emoji       text not null,
  unique(message_id, profile_id, emoji)
);

-- ----------------------------------------------------------------------------
-- FILE CENTER
-- ----------------------------------------------------------------------------
create table files (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id) on delete cascade,
  category       file_category not null,
  name           text not null,
  storage_path   text not null,
  uploaded_by    uuid references profiles(id),
  current_version int not null default 1,
  created_at     timestamptz not null default now()
);

create table file_versions (
  id           uuid primary key default gen_random_uuid(),
  file_id      uuid not null references files(id) on delete cascade,
  version      int not null,
  storage_path text not null,
  notes        text,
  uploaded_by  uuid references profiles(id),
  created_at   timestamptz not null default now(),
  unique(file_id, version)
);

-- ----------------------------------------------------------------------------
-- APPROVALS
-- ----------------------------------------------------------------------------
create table approvals (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  task_id       uuid references tasks(id) on delete set null,
  stage         approval_stage not null default 'ready_for_review',
  decision      approval_decision not null default 'pending',
  submitted_by  uuid references profiles(id),
  reviewed_by   uuid references profiles(id),
  comments      text,
  submitted_at  timestamptz not null default now(),
  decided_at    timestamptz
);
create index idx_approvals_project on approvals(project_id);

-- ----------------------------------------------------------------------------
-- MEETINGS
-- ----------------------------------------------------------------------------
create table meetings (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid references projects(id) on delete cascade,
  agency_id     uuid not null references agencies(id) on delete cascade,
  title         text not null,
  agenda        text,
  meeting_date  date not null,
  meeting_time  time not null,
  platform      meeting_platform not null default 'google_meet',
  meeting_link  text,
  minutes       text,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now()
);

create table meeting_participants (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references meetings(id) on delete cascade,
  profile_id  uuid not null references profiles(id) on delete cascade,
  attended    boolean,
  unique(meeting_id, profile_id)
);

-- ----------------------------------------------------------------------------
-- TIME TRACKING
-- ----------------------------------------------------------------------------
create table time_entries (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  task_id     uuid references tasks(id) on delete set null,
  developer_id uuid not null references profiles(id),
  started_at  timestamptz not null,
  ended_at    timestamptz,
  duration_minutes int generated always as (
    case when ended_at is not null
      then extract(epoch from (ended_at - started_at))::int / 60
      else null end
  ) stored,
  note        text,
  created_at  timestamptz not null default now()
);
create index idx_time_entries_project on time_entries(project_id);
create index idx_time_entries_dev on time_entries(developer_id);

-- ----------------------------------------------------------------------------
-- RELEASES
-- ----------------------------------------------------------------------------
create table releases (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references projects(id) on delete cascade,
  version_label  text not null,
  apk_url        text,
  zip_url        text,
  live_url       text,
  credentials    text,
  release_notes  text,
  status         release_status not null default 'pending_approval',
  requested_by   uuid references profiles(id),
  decided_by     uuid references profiles(id),
  decided_at     timestamptz,
  created_at     timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- BILLING
-- ----------------------------------------------------------------------------
create table invoices (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references agencies(id) on delete cascade,
  project_id    uuid references projects(id) on delete set null,
  invoice_number text not null unique,
  amount        numeric(12,2) not null,
  currency      text not null default 'USD',
  status        invoice_status not null default 'draft',
  due_date      date,
  paid_at       timestamptz,
  pdf_url       text,
  created_at    timestamptz not null default now()
);
create index idx_invoices_agency on invoices(agency_id);

create table invoice_line_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references invoices(id) on delete cascade,
  description text not null,
  quantity    numeric(10,2) not null default 1,
  unit_price  numeric(12,2) not null,
  line_total  numeric(12,2) generated always as (quantity * unit_price) stored
);

-- ----------------------------------------------------------------------------
-- TICKETS
-- ----------------------------------------------------------------------------
create table support_tickets (
  id            uuid primary key default gen_random_uuid(),
  agency_id     uuid not null references agencies(id) on delete cascade,
  project_id    uuid references projects(id) on delete set null,
  category      ticket_category not null,
  priority      ticket_priority not null default 'medium',
  status        ticket_status not null default 'open',
  subject       text not null,
  description   text,
  raised_by     uuid references profiles(id),
  assigned_to   uuid references profiles(id),
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);
create index idx_tickets_agency on support_tickets(agency_id);

create table ticket_replies (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references support_tickets(id) on delete cascade,
  author_id   uuid not null references profiles(id),
  body        text not null,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- ACTIVITY LOGS + NOTIFICATIONS
-- ----------------------------------------------------------------------------
create table activity_logs (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid references agencies(id) on delete cascade,
  project_id  uuid references projects(id) on delete cascade,
  actor_id    uuid references profiles(id),
  action      text not null,
  entity_type text,
  entity_id   uuid,
  meta        jsonb,
  created_at  timestamptz not null default now()
);
create index idx_activity_agency on activity_logs(agency_id);
create index idx_activity_project on activity_logs(project_id);

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  title       text not null,
  body        text,
  link        text,
  channel     notification_channel not null default 'in_app',
  is_read     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index idx_notifications_profile on notifications(profile_id, is_read);

-- ============================================================================
-- TRIGGERS
-- ============================================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_agencies_updated_at before update on agencies
  for each row execute function set_updated_at();
create trigger trg_projects_updated_at before update on projects
  for each row execute function set_updated_at();
create trigger trg_tasks_updated_at before update on tasks
  for each row execute function set_updated_at();

create or replace function seed_agency_onboarding()
returns trigger language plpgsql as $$
begin
  insert into agency_onboarding_steps (agency_id, step_key, label) values
    (new.id, 'company_details',            'Company Details'),
    (new.id, 'upload_logo',                'Upload Logo'),
    (new.id, 'team_members',               'Team Members'),
    (new.id, 'billing_information',        'Billing Information'),
    (new.id, 'preferred_communication',    'Preferred Communication'),
    (new.id, 'development_process_guide',  'Development Process Guide'),
    (new.id, 'acceptance_of_sop',          'Acceptance of SOP');
  return new;
end;
$$;

create trigger trg_seed_onboarding after insert on agencies
  for each row execute function seed_agency_onboarding();

create or replace function recalc_onboarding_progress()
returns trigger language plpgsql as $$
declare
  total int;
  done  int;
begin
  select count(*), count(*) filter (where is_complete)
    into total, done
    from agency_onboarding_steps
    where agency_id = coalesce(new.agency_id, old.agency_id);

  update agencies
    set onboarding_progress = case when total = 0 then 0 else round(done::numeric / total * 100) end
    where id = coalesce(new.agency_id, old.agency_id);

  return new;
end;
$$;

create trigger trg_recalc_progress after insert or update or delete on agency_onboarding_steps
  for each row execute function recalc_onboarding_progress();

-- ============================================================================
-- ROLE / SCOPE HELPER FUNCTIONS
-- These encode the exact hierarchy from your permission doc.
-- ============================================================================

create or replace function current_profile_agency_id()
returns uuid language sql stable as $$
  select agency_id from profiles where id = auth.uid();
$$;

create or replace function current_far_tech_role()
returns far_tech_role language sql stable as $$
  select far_tech_role from profiles where id = auth.uid() and user_type = 'far_tech';
$$;

-- Super Admin + Admin: full visibility, matches "Admin: All" everywhere in your matrix.
create or replace function is_admin_level()
returns boolean language sql stable as $$
  select current_far_tech_role() in ('super_admin','admin');
$$;

create or replace function is_far_tech_staff()
returns boolean language sql stable as $$
  select exists (select 1 from profiles where id = auth.uid() and user_type = 'far_tech');
$$;

-- Core scoping rule used across projects/tasks/files/approvals/time/releases:
-- mirrors your Visibility Matrix row for "Projects": Admin=All, Agency=Own,
-- PM=Assigned, Team Lead=Assigned, Developer=Assigned Only.
create or replace function can_access_project(pid uuid)
returns boolean language sql stable as $$
  select
    is_admin_level()
    or exists (
      select 1 from projects p
      where p.id = pid
        and (
          (current_far_tech_role() = 'project_manager' and p.project_manager_id = auth.uid())
          or (current_far_tech_role() = 'team_lead' and (
                p.team_lead_id = auth.uid()
                or exists (select 1 from project_team_members m where m.project_id = pid and m.profile_id = auth.uid())
              ))
          or (current_far_tech_role() = 'developer' and
                exists (select 1 from project_team_members m where m.project_id = pid and m.profile_id = auth.uid()))
          or (p.agency_id = current_profile_agency_id())   -- agency user, any tier
        )
    );
$$;

-- Developer sees ONLY their own assigned tasks, per matrix ("Tasks: Developer = Assigned Only").
create or replace function can_access_task(project uuid, assignee uuid)
returns boolean language sql stable as $$
  select
    is_admin_level()
    or (current_far_tech_role() = 'project_manager' and exists (select 1 from projects p where p.id = project and p.project_manager_id = auth.uid()))
    or (current_far_tech_role() = 'team_lead' and exists (select 1 from projects p where p.id = project and p.team_lead_id = auth.uid()))
    or (current_far_tech_role() = 'developer' and assignee = auth.uid())
    or (current_profile_agency_id() is not null and exists (select 1 from projects p where p.id = project and p.agency_id = current_profile_agency_id()));
$$;

-- Chat: enforces your Communication Flow diagram exactly.
--   agency_facing: Admin, the assigned PM, and the agency's own users.
--   internal:      Admin, the assigned PM, Team Lead, and Developers on the project.
create or replace function can_access_message_channel(pid uuid, ch message_channel)
returns boolean language sql stable as $$
  select case
    when is_admin_level() then true
    when ch = 'agency_facing' then
      (current_profile_agency_id() is not null and exists (select 1 from projects p where p.id = pid and p.agency_id = current_profile_agency_id()))
      or (current_far_tech_role() = 'project_manager' and exists (select 1 from projects p where p.id = pid and p.project_manager_id = auth.uid()))
    when ch = 'internal' then
      (current_far_tech_role() = 'project_manager' and exists (select 1 from projects p where p.id = pid and p.project_manager_id = auth.uid()))
      or (current_far_tech_role() = 'team_lead' and exists (select 1 from projects p where p.id = pid and p.team_lead_id = auth.uid()))
      or (current_far_tech_role() = 'developer' and exists (select 1 from project_team_members m where m.project_id = pid and m.profile_id = auth.uid()))
    else false
  end;
$$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table agencies enable row level security;
alter table agency_onboarding_steps enable row level security;
alter table profiles enable row level security;
alter table agreements enable row level security;
alter table projects enable row level security;
alter table project_request_files enable row level security;
alter table project_team_members enable row level security;
alter table modules enable row level security;
alter table tasks enable row level security;
alter table messages enable row level security;
alter table message_attachments enable row level security;
alter table message_mentions enable row level security;
alter table message_reactions enable row level security;
alter table files enable row level security;
alter table file_versions enable row level security;
alter table approvals enable row level security;
alter table meetings enable row level security;
alter table meeting_participants enable row level security;
alter table time_entries enable row level security;
alter table releases enable row level security;
alter table invoices enable row level security;
alter table invoice_line_items enable row level security;
alter table support_tickets enable row level security;
alter table ticket_replies enable row level security;
alter table activity_logs enable row level security;
alter table notifications enable row level security;

-- Agencies: matrix says Agency module = Admin:All, Agency:Own, PM:"View Assigned", TL/Dev:No
create policy agencies_admin_all on agencies for all
  using (is_admin_level()) with check (is_admin_level());
create policy agencies_pm_view_assigned on agencies for select
  using (current_far_tech_role() = 'project_manager' and exists (
    select 1 from projects p where p.agency_id = agencies.id and p.project_manager_id = auth.uid()));
create policy agencies_self_read on agencies for select
  using (id = current_profile_agency_id());
create policy agencies_self_update on agencies for update
  using (id = current_profile_agency_id());

create policy onboarding_steps_scoped on agency_onboarding_steps for all
  using (is_admin_level() or agency_id = current_profile_agency_id())
  with check (is_admin_level() or agency_id = current_profile_agency_id());

-- Profiles: everyone can read people relevant to their scope; Admin manages all.
create policy profiles_admin_all on profiles for all
  using (is_admin_level()) with check (is_admin_level());
create policy profiles_self_and_agency on profiles for select
  using (id = auth.uid() or agency_id = current_profile_agency_id() or is_far_tech_staff());
create policy profiles_self_update on profiles for update
  using (id = auth.uid());

create policy agreements_scoped on agreements for all
  using (is_admin_level() or agency_id = current_profile_agency_id())
  with check (is_admin_level() or agency_id = current_profile_agency_id());

-- Projects: agency can INSERT (create project requests) but only Admin can set
-- project_manager_id (enforced in app layer / Edge Function, not just RLS).
create policy projects_scoped_select on projects for select
  using (can_access_project(id));
create policy projects_agency_insert on projects for insert
  with check (agency_id = current_profile_agency_id() or is_admin_level());
create policy projects_scoped_update on projects for update
  using (
    is_admin_level()
    or (current_far_tech_role() = 'project_manager' and project_manager_id = auth.uid())
    or (current_far_tech_role() = 'team_lead' and team_lead_id = auth.uid())
  );

create policy project_request_files_scoped on project_request_files for all
  using (can_access_project(project_id)) with check (can_access_project(project_id));

-- Only Admin or the assigned PM/Team Lead can add team members (assignment chain).
create policy project_team_scoped_select on project_team_members for select
  using (can_access_project(project_id));
create policy project_team_pm_tl_insert on project_team_members for insert
  with check (
    is_admin_level()
    or (current_far_tech_role() = 'project_manager' and exists (select 1 from projects p where p.id = project_id and p.project_manager_id = auth.uid()))
    or (current_far_tech_role() = 'team_lead' and exists (select 1 from projects p where p.id = project_id and p.team_lead_id = auth.uid()))
  );

create policy modules_scoped on modules for all
  using (can_access_project(project_id)) with check (can_access_project(project_id));

-- Tasks: Developer only sees/updates their OWN assigned tasks (matrix: "Assigned Only").
create policy tasks_scoped_select on tasks for select
  using (can_access_task(project_id, assigned_to));
create policy tasks_pm_tl_write on tasks for insert
  with check (
    is_admin_level()
    or (current_far_tech_role() = 'project_manager' and exists (select 1 from projects p where p.id = project_id and p.project_manager_id = auth.uid()))
    or (current_far_tech_role() = 'team_lead' and exists (select 1 from projects p where p.id = project_id and p.team_lead_id = auth.uid()))
  );
create policy tasks_update_scoped on tasks for update
  using (can_access_task(project_id, assigned_to));

-- Messages: dual channel, enforced by can_access_message_channel().
create policy messages_scoped_select on messages for select
  using (can_access_message_channel(project_id, channel));
create policy messages_scoped_insert on messages for insert
  with check (can_access_message_channel(project_id, channel) and author_id = auth.uid());

create policy message_attachments_scoped on message_attachments for all
  using (exists (select 1 from messages m where m.id = message_id and can_access_message_channel(m.project_id, m.channel)));
create policy message_mentions_scoped on message_mentions for all
  using (exists (select 1 from messages m where m.id = message_id and can_access_message_channel(m.project_id, m.channel)));
create policy message_reactions_scoped on message_reactions for all
  using (exists (select 1 from messages m where m.id = message_id and can_access_message_channel(m.project_id, m.channel)));

create policy files_scoped on files for all
  using (can_access_project(project_id)) with check (can_access_project(project_id));
create policy file_versions_scoped on file_versions for all
  using (exists (select 1 from files f where f.id = file_id and can_access_project(f.project_id)));

create policy approvals_scoped on approvals for all
  using (can_access_project(project_id)) with check (can_access_project(project_id));

create policy meetings_scoped on meetings for all
  using (is_admin_level() or agency_id = current_profile_agency_id() or (project_id is not null and can_access_project(project_id)))
  with check (is_admin_level() or agency_id = current_profile_agency_id());
create policy meeting_participants_scoped on meeting_participants for all
  using (exists (select 1 from meetings mt where mt.id = meeting_id and (is_admin_level() or mt.agency_id = current_profile_agency_id())));

-- Time tracking: matrix has this as internal-only (Agency: not listed = no access).
create policy time_entries_scoped on time_entries for all
  using (
    is_admin_level()
    or (current_far_tech_role() in ('project_manager','team_lead') and can_access_project(project_id))
    or (current_far_tech_role() = 'developer' and developer_id = auth.uid())
  )
  with check (current_far_tech_role() = 'developer' and developer_id = auth.uid() or is_admin_level());

create policy releases_scoped on releases for all
  using (can_access_project(project_id)) with check (can_access_project(project_id));

-- Invoices: matrix = Admin:All, Agency:Own, PM:View, Team Lead/Developer:No.
create policy invoices_admin_all on invoices for all
  using (is_admin_level()) with check (is_admin_level());
create policy invoices_agency_read on invoices for select
  using (agency_id = current_profile_agency_id());
create policy invoices_pm_view on invoices for select
  using (current_far_tech_role() = 'project_manager' and exists (
    select 1 from projects p where p.id = project_id and p.project_manager_id = auth.uid()));

create policy invoice_lines_scoped on invoice_line_items for select
  using (exists (
    select 1 from invoices i where i.id = invoice_id
      and (is_admin_level() or i.agency_id = current_profile_agency_id())));

create policy tickets_scoped on support_tickets for all
  using (is_admin_level() or agency_id = current_profile_agency_id() or (project_id is not null and can_access_project(project_id)))
  with check (is_admin_level() or agency_id = current_profile_agency_id());
create policy ticket_replies_scoped on ticket_replies for all
  using (exists (select 1 from support_tickets t where t.id = ticket_id
      and (is_admin_level() or t.agency_id = current_profile_agency_id() or (t.project_id is not null and can_access_project(t.project_id)))));

-- Audit logs: matrix = Admin only, everyone else: No.
create policy activity_logs_admin_only on activity_logs for select
  using (is_admin_level());
create policy activity_logs_insert on activity_logs for insert
  with check (true);   -- app/service inserts on behalf of any actor

create policy notifications_own on notifications for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ============================================================================
-- STORAGE BUCKETS — create these in the Storage tab, not via SQL:
--   project-files (private), agency-logos (public), avatars (public)
-- Mirror can_access_project() logic in storage policies using the
-- {agency_id}/{project_id}/{filename} path convention described in the
-- deployment guide.
-- ============================================================================
