import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Creates the auth user AND confirms it immediately with a password you set —
// no invite email involved. Share the credentials with the employee yourself.
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
      .select("user_type, far_tech_role")
      .eq("id", user.id)
      .single();

    if (!callerProfile || callerProfile.user_type !== "far_tech" || !["super_admin", "admin"].includes(callerProfile.far_tech_role)) {
      return new Response(JSON.stringify({ error: "Only Admins can add employees" }), { status: 403, headers: corsHeaders });
    }

    const { email, fullName, farTechRole, department, password } = await req.json();
    const validRoles = ["admin", "project_manager", "team_lead", "developer"]; // super_admin excluded — only one ever exists
    if (!email || !password || !validRoles.includes(farTechRole)) {
      return new Response(JSON.stringify({ error: `email, password, and a valid role (${validRoles.join(", ")}) are required` }), { status: 400, headers: corsHeaders });
    }
    if (password.length < 8) {
      return new Response(JSON.stringify({ error: "Password must be at least 8 characters" }), { status: 400, headers: corsHeaders });
    }

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email, password, email_confirm: true, // true = skip email verification entirely
    });
    if (createErr) return new Response(JSON.stringify({ error: createErr.message }), { status: 400, headers: corsHeaders });

    const { error: profileErr } = await supabaseAdmin.from("profiles").insert({
      id: created.user.id,
      user_type: "far_tech",
      far_tech_role: farTechRole,
      department: department || null,
      full_name: fullName || email,
      email,
      invited_by: user.id,
    });
    if (profileErr) {
      // Roll back the auth user so we don't leave an orphaned account with no profile.
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      return new Response(JSON.stringify({ error: profileErr.message }), { status: 400, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ success: true, userId: created.user.id }), { status: 200, headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
