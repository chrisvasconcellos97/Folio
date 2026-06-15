import { useState, useEffect, useMemo } from "react";
import { C } from "../lib/colors";
import { InputField, SelectField } from "./InputField";

function memberLabel(m) {
  return m.full_name || (m.invited_email || m.email || "").split("@")[0] || "";
}

function contactLabel(c) {
  var role = c.title || c.role;
  return c.name + (role ? " · " + role : "");
}

/**
 * PersonPicker — shared assignee/recipient picker, grouped by workspace so
 * people are easy to find. Group order:
 *   1. The task/project's account contacts first (one group per linked account)
 *   2. My Team (org members)
 *   3. Everyone else — remaining contacts grouped by their account (workspace)
 * Plus a "Someone else…" option that swaps to a free-text name/email field, so
 * you're never locked to a fixed list.
 *
 * Props:
 *   value, onChange(value|null)
 *   members      — org members [{ email, full_name, ... }]
 *   contacts     — ALL contacts [{ id, name, title|role, account_id }]
 *   accounts     — [{ id, name }] for workspace group labels
 *   accountIds   — the task/project's account ids, surfaced first (in order)
 *   noneLabel    — label for the empty option ("Unassigned" / "— No recipient —")
 *   contactValue — fn(c) => stored value (default c.email || c.name)
 *   style        — passed to the control
 */
export function PersonPicker({ value, onChange, members, contacts, accounts, accountIds, noneLabel, contactValue, style }) {
  var mems = (members || []).filter(function (m, i, arr) {
    var key = m.email || m.invited_email || m.id || i;
    return arr.findIndex(function (x) { return (x.email || x.invited_email || x.id) === key; }) === i;
  });
  var cons = contacts || [];
  var accts = accounts || [];
  var primaryIds = (accountIds || []).filter(Boolean);
  var valueOf = contactValue || function (c) { return c.name; };
  var primaryKey = primaryIds.join(",");

  var acctName = useMemo(function () {
    var m = {};
    accts.forEach(function (a) { m[a.id] = a.name; });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accts]);

  // Ordered groups: account contacts first, then My Team, then others by workspace.
  var groups = useMemo(function () {
    var out = [];
    var used = {};
    var seenAcct = {};
    primaryIds.forEach(function (aid) {
      if (seenAcct[aid]) return;
      seenAcct[aid] = true;
      var list = cons.filter(function (c) { return c.account_id === aid; });
      if (list.length) {
        out.push({ label: acctName[aid] || "Account", contacts: list });
        list.forEach(function (c) { used[c.id] = true; });
      }
    });
    if (mems.length) out.push({ label: "My Team", members: mems });
    var remaining = cons.filter(function (c) { return !used[c.id]; });
    var byAcct = {};
    remaining.forEach(function (c) {
      var k = c.account_id || "_none";
      (byAcct[k] = byAcct[k] || []).push(c);
    });
    Object.keys(byAcct)
      .sort(function (a, b) { return (acctName[a] || "ZZ").localeCompare(acctName[b] || "ZZ"); })
      .forEach(function (k) { out.push({ label: acctName[k] || "Other", contacts: byAcct[k] }); });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cons, mems, primaryKey, acctName]);

  var known = useMemo(function () {
    var k = {};
    mems.forEach(function (m) {
      if (m.email) k[m.email] = true;
      if (m.invited_email) k[m.invited_email] = true;
    });
    cons.forEach(function (c) { k[valueOf(c)] = true; });
    return k;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mems, cons]);

  var hasOptions = groups.length > 0;
  var valueKnown = !value || known[value];
  var [manual, setManual] = useState((Boolean(value) && !valueKnown) || !hasOptions);

  useEffect(function () {
    if (value && !known[value] && !manual) setManual(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  if (manual) {
    return (
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <InputField
          value={value || ""}
          onChange={function (e) { onChange(e.target.value || null); }}
          placeholder="Name or email"
          style={style}
        />
        {hasOptions && (
          <button
            type="button"
            onClick={function () { setManual(false); onChange(null); }}
            title="Pick from list"
            style={{
              background: "transparent", border: "1px solid " + C.rule, borderRadius: 6,
              padding: "4px 9px", color: C.textMuted, cursor: "pointer", fontSize: 11, whiteSpace: "nowrap",
            }}
          >
            ☰ List
          </button>
        )}
      </div>
    );
  }

  return (
    <SelectField
      value={value || ""}
      onChange={function (e) {
        if (e.target.value === "__other__") { setManual(true); onChange(null); return; }
        onChange(e.target.value || null);
      }}
      style={style}
    >
      <option value="">{noneLabel || "Unassigned"}</option>
      {groups.map(function (g, gi) {
        return (
          <optgroup key={gi} label={g.label}>
            {g.members
              ? g.members.map(function (m) {
                  return <option key={m.email || m.invited_email || m.id} value={m.email || m.invited_email || ""}>{memberLabel(m)}</option>;
                })
              : g.contacts.map(function (c) {
                  return <option key={c.id} value={valueOf(c)}>{contactLabel(c)}</option>;
                })}
          </optgroup>
        );
      })}
      <option value="__other__">✎ Someone else…</option>
    </SelectField>
  );
}
