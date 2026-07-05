import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Creates an agency user (owner/manager/staff) with a password you set —
// no invite email. Assumes the agency row already exists; pass its id.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Missing auth" }), { status: 401, headers: corsHeaders });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !user) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401, headers: corsHeaders });

    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("user_type, far_tech_role, agency_id, agency_role")
      .eq("id", user.id)
      .single();

    const { email, fullName, agencyId, agencyRole, password } = await req.json();

    const isFarTechAdmin = callerProfile?.user_type === "far_tech" && ["super_admin", "admin"].includes(callerProfile.far_tech_role);
    const isAgencyOwnerOrManager = callerProfile?.user_type === "agency"
      && callerProfile.agency_id === agencyId
      && ["owner", "manager"].includes(callerProfile.agency_role);

    if (!isFarTechAdmin && !isAgencyOwnerOrManager) {
      return new Response(JSON.stringify({ error: "Not authorized to add a user to this agency" }), { status: 403, headers: corsHeaders });
    }

    const validRoles = ["owner", "manager", "staff"];
    if (!email || !password || !agencyId || !validRoles.includes(agencyRole || "owner")) {
      return new Response(JSON.stringify({ error: "email, password, and agencyId are required" }), { status: 400, headers: corsHeaders });
    }
    if (password.length < 8) {
      return new Response(JSON.stringify({ error: "Password must be at least 8 characters" }), { status: 400, headers: corsHeaders });
    }

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (createErr) return new Response(JSON.stringify({ error: createErr.message }), { status: 400, headers: corsHeaders });

    const { error: profileErr } = await supabaseAdmin.from("profiles").insert({
      id: created.user.id,
      user_type: "agency",
      agency_id: agencyId,
      agency_role: agencyRole || "owner",
      full_name: fullName || email,
      email,
      invited_by: user.id,
    });
    if (profileErr) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      return new Response(JSON.stringify({ error: profileErr.message }), { status: 400, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ success: true, userId: created.user.id }), { status: 200, headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
