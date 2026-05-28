import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { fetchWithTimeout } from "../lib/net";

export function useOrg(userId, userEmail) {
  var [org, setOrg]                   = useState(null);
  var [role, setRole]                 = useState(null);
  var [members, setMembers]           = useState([]);
  var [pendingInvites, setPending]    = useState([]);
  var [myInvite, setMyInvite]         = useState(null); // invite waiting for this user to accept
  var [loading, setLoading]           = useState(false);
  var [error, setError]               = useState(null);

  var fetch = useCallback(function () {
    if (!userId) return;
    setLoading(true);

    // Look for an accepted membership
    supabase
      .from("folio_org_members")
      .select("*, folio_orgs(*)")
      .eq("user_id", userId)
      .eq("accepted", true)
      .maybeSingle()
      .then(function (result) {
        if (result.error) {
          setLoading(false);
          setError(result.error.message);
          return;
        }

        if (result.data) {
          var membership = result.data;
          setOrg(membership.folio_orgs);
          setRole(membership.role);

          // Load all members + pending invites in this org
          supabase
            .from("folio_org_members")
            .select("*")
            .eq("org_id", membership.org_id)
            .order("created_at")
            .then(function (r) {
              setLoading(false);
              if (r.error) return;
              // Note: members includes both active and inactive; consumers split
              // by .is_inactive. Pending invites stay separate.
              setMembers(r.data.filter(function (m) { return m.accepted; }));
              setPending(r.data.filter(function (m) { return !m.accepted; }));
            });
        } else {
          // No accepted membership — check for a pending invite by email
          setOrg(null);
          setRole(null);
          setMembers([]);
          setPending([]);

          if (userEmail) {
            supabase
              .from("folio_org_members")
              .select("*, folio_orgs(*)")
              .eq("invited_email", userEmail)
              .eq("accepted", false)
              .maybeSingle()
              .then(function (r) {
                setLoading(false);
                if (!r.error && r.data) setMyInvite(r.data);
                else setMyInvite(null);
              });
          } else {
            setLoading(false);
          }
        }
      });
  }, [userId, userEmail]);

  useEffect(function () { fetch(); }, [fetch]);

  function createOrg(name) {
    return supabase
      .from("folio_orgs")
      .insert([{ name: name.trim(), owner_id: userId }])
      .select()
      .then(function (result) {
        if (result.error) throw result.error;
        var newOrg = result.data[0];
        return supabase
          .from("folio_org_members")
          .insert([{ org_id: newOrg.id, user_id: userId, role: "owner", invited_email: userEmail || null, accepted: true }])
          .then(function (r) {
            if (r.error) throw r.error;
            fetch();
            return newOrg;
          });
      });
  }

  function inviteMember(email, memberRole) {
    if (!org) return Promise.reject(new Error("No org"));
    var trimmedEmail = email.trim().toLowerCase();
    return supabase
      .from("folio_org_members")
      .insert([{ org_id: org.id, user_id: null, role: memberRole, invited_email: trimmedEmail, accepted: false }])
      .then(function (result) {
        if (result.error) throw result.error;
        fetch();
        // Try to send invite email; surface result so UI can fall back to copy-link
        return supabase.auth.getSession().then(function(sessionResult) {
          var token = sessionResult.data && sessionResult.data.session ? sessionResult.data.session.access_token : null;
          if (!token) return { emailSent: false, reason: "no_session" };
          return fetchWithTimeout("/api/invite", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
            body: JSON.stringify({
              email: trimmedEmail,
              role: memberRole,
              orgId: org.id,
              appUrl: window.location.origin,
            }),
          }, 20000).then(function(r) {
            if (r.ok) return { emailSent: true };
            return r.json().then(
              function(j) { return { emailSent: false, reason: j.error || "send_failed" }; },
              function()  { return { emailSent: false, reason: "send_failed" }; }
            );
          }).catch(function(err) {
            return { emailSent: false, reason: err && err.code === "TIMEOUT" ? "timeout" : "network" };
          });
        });
      });
  }

  function revokeMember(memberId) {
    return supabase
      .from("folio_org_members")
      .delete()
      .eq("id", memberId)
      .then(function (result) {
        if (result.error) throw result.error;
        fetch();
      });
  }

  // Soft-archive a member — they keep their auth row but `is_inactive=true`
  // blocks sign-in via useAuth's shouldBlockSignIn probe. Historical
  // assignments stay intact.
  function archiveMember(memberId) {
    return supabase
      .from("folio_org_members")
      .update({ is_inactive: true, inactivated_at: new Date().toISOString() })
      .eq("id", memberId)
      .then(function (result) {
        if (result.error) throw result.error;
        fetch();
      });
  }

  function reactivateMember(memberId) {
    return supabase
      .from("folio_org_members")
      .update({ is_inactive: false, inactivated_at: null })
      .eq("id", memberId)
      .then(function (result) {
        if (result.error) throw result.error;
        fetch();
      });
  }

  function acceptInvite(inviteId) {
    return supabase
      .from("folio_org_members")
      .update({ user_id: userId, accepted: true })
      .eq("id", inviteId)
      .then(function (result) {
        if (result.error) throw result.error;
        setMyInvite(null);
        fetch();
      });
  }

  function dismissInvite() {
    setMyInvite(null);
  }

  return {
    org,
    orgId:         org ? org.id : null,
    role,
    members,
    pendingInvites,
    myInvite,
    loading,
    error,
    refetch:       fetch,
    createOrg,
    inviteMember,
    revokeMember,
    archiveMember,
    reactivateMember,
    acceptInvite,
    dismissInvite,
  };
}
