import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fails loudly in dev if .env.local is missing, instead of silently
  // breaking every Supabase call later.
  console.error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.local.example to .env.local and fill in your Supabase project values.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// supabase-js's `functions.invoke()` sometimes consumes the response body
// internally while building its own generic error, which makes a second
// read of the body (to get the real message) fail silently. Calling the
// function directly with fetch gives us one clean read of the body, always.
export async function callEdgeFunction(name, body) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { data: null, error: { message: "Not signed in" } };

  let res;
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
        "apikey": supabaseAnonKey,
      },
      body: JSON.stringify(body),
    });
  } catch (networkErr) {
    return { data: null, error: { message: `Network error reaching ${name}: ${networkErr.message}` } };
  }

  let json;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    return { data: null, error: { message: json?.error || `${name} returned HTTP ${res.status}` } };
  }
  return { data: json, error: null };
}
