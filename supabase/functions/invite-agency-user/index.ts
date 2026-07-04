import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

serve(async (req) => {
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Missing auth" }), { status: 401 });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !user) return new Response(JSON.stringify({ error: "Invalid session" }), { status: 401 });

    // Only Admin / Super Admin can create agencies & invite their first user.
    const { data: callerProfile } = await supabaseAdmin
      .from("profiles")
      .select("user_type, far_tech_role")
      .eq("id", user.id)
      .single();

    if (!callerProfile || callerProfile.user_type !== "far_tech" || !["super_admin", "admin"].includes(callerProfile.far_tech_role)) {
      return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403 });
    }

    const { email, fullName, agencyId, agencyRole } = await req.json();
    if (!email || !agencyId) {
      return new Response(JSON.stringify({ error: "email and agencyId are required" }), { status: 400 });
    }

    // agency_role enum (schema v2): owner | manager | staff
    const role = ["owner", "manager", "staff"].includes(agencyRole) ? agencyRole : "owner";

    const { data: invited, error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: "https://app.fartech.dev/welcome", // update to your real domain
    });
    if (inviteErr) return new Response(JSON.stringify({ error: inviteErr.message }), { status: 400 });

    const { error: profileErr } = await supabaseAdmin.from("profiles").insert({
      id: invited.user.id,
      user_type: "agency",
      agency_id: agencyId,
      agency_role: role,
      full_name: fullName || email,
      email,
      invited_by: user.id,
    });
    if (profileErr) return new Response(JSON.stringify({ error: profileErr.message }), { status: 400 });

    return new Response(JSON.stringify({ success: true, userId: invited.user.id }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});
