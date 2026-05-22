import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";

var INACTIVITY_MS = 60 * 60 * 1000;
var ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "scroll"];

export function useAuth() {
  var [session, setSession] = useState(null);
  var [loading, setLoading] = useState(true);
  var timeoutRef = useRef(null);

  function resetInactivityTimer() {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(function () {
      supabase.auth.signOut();
    }, INACTIVITY_MS);
  }

  useEffect(function () {
    supabase.auth.getSession().then(function (result) {
      setSession(result.data.session);
      setLoading(false);
    });

    var listener = supabase.auth.onAuthStateChange(function (_event, s) {
      setSession(s);
      if (s) {
        resetInactivityTimer();
      } else {
        clearTimeout(timeoutRef.current);
      }
    });

    return function () {
      listener.data.subscription.unsubscribe();
      clearTimeout(timeoutRef.current);
    };
  }, []);

  useEffect(function () {
    if (!session) return;
    resetInactivityTimer();
    ACTIVITY_EVENTS.forEach(function (e) {
      window.addEventListener(e, resetInactivityTimer, { passive: true });
    });
    return function () {
      clearTimeout(timeoutRef.current);
      ACTIVITY_EVENTS.forEach(function (e) {
        window.removeEventListener(e, resetInactivityTimer);
      });
    };
  }, [session]);

  function signIn(email, password) {
    return supabase.auth.signInWithPassword({ email: email, password: password });
  }

  function signOut() {
    return supabase.auth.signOut();
  }

  return { session, loading, signIn, signOut };
}
