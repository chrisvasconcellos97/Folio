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
  "folio_search_history", // Account-name fragments from prior searches
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

// Sign-in block check: a user is locked out only if they belong to at
// least one org as an inactive member AND have NO active memberships in
// any org. Multi-org edge case from the spec — being deactivated in one
// org shouldn't kick them out of another.
//
// Trace: this runs after supabase has set the session (so RLS will treat
// the user as authenticated) but before App.jsx renders any
// account-bearing view. We read folio_org_members rows where user_id =
// the just-signed-in user; the org_members RLS policies allow members
// to read their own rows (see team_org_layer.sql / phase1_security.sql).
// If we can't determine membership at all (network blip, RLS hiccup)
// we fail OPEN so a transient error doesn't lock everyone out.
function shouldBlockSignIn(userId) {
  if (!userId) return Promise.resolve(false);
  return supabase
    .from("folio_org_members")
    .select("is_inactive, accepted")
    .eq("user_id", userId)
    .then(function (r) {
      if (r.error) return false;                              // fail open
      var rows = r.data || [];
      if (rows.length === 0) return false;                    // no memberships → not blocked
      var hasActive = rows.some(function (row) {
        return row.accepted && !row.is_inactive;
      });
      return !hasActive;
    })
    .catch(function () { return false; });                    // fail open
}

export function useAuth() {
  var [session, setSession]       = useState(null);
  var [loading, setLoading]       = useState(true);
  var [inactiveBlock, setInactiveBlock] = useState(false);
  var timeoutRef = useRef(null);

  function resetInactivityTimer() {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(function () {
      supabase.auth.signOut();
    }, INACTIVITY_MS);
  }

  // Wrap the inactive-membership probe so we can run it from both the
  // initial getSession() restore and the onAuthStateChange listener.
  function gateSession(s, cb) {
    if (!s) { cb(s); return; }
    shouldBlockSignIn(s.user.id).then(function (blocked) {
      if (blocked) {
        setInactiveBlock(true);
        // Sign them out immediately — the SIGNED_OUT event then wipes
        // localStorage via the existing listener.
        supabase.auth.signOut();
        cb(null);
      } else {
        setInactiveBlock(false);
        cb(s);
      }
    });
  }

  useEffect(function () {
    supabase.auth.getSession().then(function (result) {
      gateSession(result.data.session, function (s) {
        setSession(s);
        setLoading(false);
      });
    });

    var listener = supabase.auth.onAuthStateChange(function (event, s) {
      gateSession(s, function (finalSession) {
        setSession(finalSession);
        if (finalSession) {
          resetInactivityTimer();
        } else {
          clearTimeout(timeoutRef.current);
          // SIGNED_OUT fires for both explicit sign-out and inactivity logout.
          // Wipe cached account/meeting/pip data so the next user on a shared
          // device can't read this user's records from localStorage.
          if (event === "SIGNED_OUT") wipeSensitiveLocalStorage();
        }
      });
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

  function dismissInactiveBlock() { setInactiveBlock(false); }

  return { session, loading, signIn, signUp, signOut, inactiveBlock, dismissInactiveBlock };
}
