import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

// Tracks the Supabase auth session and loads the matching `profiles` row
// (joined with `agencies` for agency users). This is the single source of
// truth for "who is logged in and what can they see" — App.jsx renders
// entirely off `profile`, never off a manual role toggle.
export function useSession() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState(null);

  async function loadProfile(userId) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*, agencies(*)")
      .eq("id", userId)
      .single();
    if (error) {
      setProfileError(error.message);
      setProfile(null);
    } else {
      setProfileError(null);
      setProfile(data);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session?.user) await loadProfile(session.user.id);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session?.user) {
        await loadProfile(session.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  return { session, profile, loading, profileError, refreshProfile: () => session?.user && loadProfile(session.user.id) };
}

export async function signOut() {
  await supabase.auth.signOut();
}
