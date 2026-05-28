import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";

var INACTIVITY_MS = 60 * 60 * 1000; // 60 minutes
var ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "scroll"];

// Keys we wrote to localStorage that contain Supabase-backed business data
// (account list, meeting list, Pip chat history). Wiped on sign-out so a
// shared-computer next-user can't read the previous user's accounts.
// Onboarding flags / search history / UI prefs are NOT wiped — those are
// keyed by user id (or per-tab UI state) and harmless to leave.
var SENSITIVE_LOCALSTORAGE_PREFIXES = [
  "folio_accts_",         // useAccounts cache
  "folio_meetings_",      // useMeetings cache
  "folio_pip_messages_",  // PipView chat transcript (per-user)
];

function wipeSensitiveLocalStorage() {
  try {
    var toDelete = [];
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (!k) continue;
      for (var j = 0; j < SENSITIVE_LOCALSTORAGE_PREFIXES.length; j++) {
        if (k.indexOf(SENSITIVE_LOCALSTORAGE_PREFIXES[j]) === 0) {
          toDelete.push(k);
          break;
        }
      }
    }
    toDelete.forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
  } catch (e) {
    // localStorage can throw in private-mode / quota-exceeded; swallow.
  }
}

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

    var listener = supabase.auth.onAuthStateChange(function (event, s) {
      setSession(s);
      if (s) {
        resetInactivityTimer();
      } else {
        clearTimeout(timeoutRef.current);
        // SIGNED_OUT fires for both explicit sign-out and inactivity logout.
        // Wipe cached account/meeting/pip data so the next user on a shared
        // device can't read this user's records from localStorage.
        if (event === "SIGNED_OUT") wipeSensitiveLocalStorage();
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

  function signUp(email, password, meta) {
    return supabase.auth.signUp({ email: email, password: password, options: { data: meta } });
  }

  function signOut() {
    return supabase.auth.signOut();
  }

  return { session, loading, signIn, signUp, signOut };
}
