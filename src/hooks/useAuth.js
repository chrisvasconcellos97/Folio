import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export function useAuth() {
  var [session, setSession] = useState(null);
  var [loading, setLoading] = useState(true);

  useEffect(function () {
    supabase.auth.getSession().then(function (result) {
      setSession(result.data.session);
      setLoading(false);
    });

    var listener = supabase.auth.onAuthStateChange(function (_event, s) {
      setSession(s);
    });

    return function () {
      listener.data.subscription.unsubscribe();
    };
  }, []);

  function signIn(email, password) {
    return supabase.auth.signInWithPassword({ email: email, password: password });
  }

  function signUp(email, password, meta) {
    return supabase.auth.signUp({ email: email, password: password, options: { data: meta } });
  }

  function signOut() {
    return supabase.auth.signOut();
  }

  return { session, loading, signIn, signUp, signOut };
}
