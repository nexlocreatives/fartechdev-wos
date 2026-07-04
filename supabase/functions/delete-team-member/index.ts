import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Deleting the auth user cascades to delete the matching `profiles` row
// automatically (profiles.id references auth.users(id) on delete cascade).
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
      return new Response(JSON.stringify({ error: "Only Admins can remove employees" }), { status: 403, headers: corsHeaders });
    }

    const { targetUserId } = await req.json();
    if (!targetUserId) return new Response(JSON.stringify({ error: "targetUserId is required" }), { status: 400, headers: corsHeaders });
    if (targetUserId === user.id) return new Response(JSON.stringify({ error: "You can't remove your own account" }), { status: 400, headers: corsHeaders });

    const { data: targetProfile } = await supabaseAdmin.from("profiles").select("far_tech_role").eq("id", targetUserId).single();
    if (targetProfile?.far_tech_role === "super_admin") {
      return new Response(JSON.stringify({ error: "The Super Admin account can't be removed" }), { status: 400, headers: corsHeaders });
    }

    const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);
    if (deleteErr) return new Response(JSON.stringify({ error: deleteErr.message }), { status: 400, headers: corsHeaders });

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
});
