import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { C } from "../lib/colors";
import { Modal } from "./Modal";
import { InputField } from "./InputField";
import { FL } from "./FieldLabel";

function getInitials(name) {
  if (!name) return "?";
  var parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function ProfileModal({ userMeta, onClose }) {
  var [name, setName]     = useState(userMeta ? userMeta.full_name || "" : "");
  var [title, setTitle]   = useState(userMeta ? userMeta.title || "" : "");
  var [saving, setSaving] = useState(false);
  var [error, setError]   = useState("");

  function handleSave() {
    if (!name.trim() || saving) return;
    setSaving(true);
    supabase.auth.updateUser({ data: { full_name: name.trim(), title: title.trim() } })
      .then(function (result) {
        setSaving(false);
        if (result.error) { setError(result.error.message); return; }
        onClose();
      });
  }

  return (
    <Modal title="Edit Profile" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <FL>Full Name</FL>
          <InputField
            value={name}
            onChange={function (e) { setName(e.target.value); }}
            placeholder="Your name"
            autoFocus
          />
        </div>
        <div>
          <FL>Title</FL>
          <InputField
            value={title}
            onChange={function (e) { setTitle(e.target.value); }}
            placeholder="e.g. Account Manager"
          />
        </div>
        {error && <div style={{ fontSize: 12, color: C.red }}>{error}</div>}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
          <button onClick={onClose} style={{
            background: "none", border: "1px solid " + C.border, borderRadius: 20,
            padding: "8px 18px", fontSize: 12, fontWeight: 600, color: C.textSub,
            fontFamily: "'Inter', system-ui, sans-serif", cursor: "pointer",
          }}>Cancel</button>
          <button onClick={handleSave} disabled={!name.trim() || saving} style={{
            background: !name.trim() || saving ? C.accentDim : C.accent,
            border: "none", borderRadius: 20, padding: "8px 22px",
            fontSize: 12, fontWeight: 700, color: "#fff",
            fontFamily: "'Inter', system-ui, sans-serif",
            cursor: !name.trim() || saving ? "default" : "pointer",
            opacity: saving ? 0.7 : 1,
          }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

var MENU_ITEMS = [
  { id: "profile",       label: "Profile",       icon: "◎" },
  { id: "tour",          label: "App Tour",       icon: "◉" },
  { id: "org",           label: "Settings",      icon: "⚙" },
  { id: "notifications", label: "Notifications",  icon: "◎", soon: true },
];

export function UserMenu({ userMeta, onSignOut, onTour, onSettings, dropUp }) {
  var [open, setOpen]           = useState(false);
  var [showProfile, setProfile] = useState(false);
  var menuRef                   = useRef(null);

  var initials = getInitials(userMeta ? userMeta.full_name : "");

  useEffect(function () {
    if (!open) return;
    function handleOutside(e) {
      if (menuRef.current && menuRef.current.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return function () {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [open]);

  function handleItem(id) {
    setOpen(false);
    if (id === "profile") { setProfile(true); return; }
    if (id === "tour")    { onTour && onTour(); return; }
    if (id === "org")     { onSettings && onSettings(); return; }
    if (id === "signout") { onSignOut && onSignOut(); return; }
  }

  return (
    <>
      <div ref={menuRef} style={{ position: "relative" }}>
        {/* Avatar */}
        <button
          onClick={function () { setOpen(function (v) { return !v; }); }}
          style={{
            width: 32, height: 32, borderRadius: "50%",
            background: open ? C.accent : C.accentGlow,
            border: "1px solid " + (open ? C.accent : C.accentRing),
            color: open ? "#091712" : C.accent,
            fontSize: 11, fontWeight: 700,
            fontFamily: "'Inter', system-ui, sans-serif",
            cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background 0.15s, border-color 0.15s, color 0.15s",
            flexShrink: 0,
          }}
        >
          {initials}
        </button>

        {/* Dropdown */}
        {open && (
          <div
            className="fade-in"
            style={{
              position: "absolute",
              right: 0,
              [dropUp ? "bottom" : "top"]: "calc(100% + 8px)",
              width: 214,
              background: C.bgCard,
              border: "1px solid " + C.border,
              borderRadius: 12,
              overflow: "hidden",
              zIndex: 500,
              boxShadow: "0 8px 28px rgba(0,0,0,0.45)",
            }}
          >
            {/* User header */}
            <div style={{
              padding: "12px 14px 11px",
              borderBottom: "1px solid " + C.border,
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                {userMeta ? userMeta.full_name || "User" : "User"}
              </div>
              {userMeta && userMeta.title && (
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 1 }}>
                  {userMeta.title}
                </div>
              )}
            </div>

            {/* Items */}
            <div style={{ padding: "5px 0" }}>
              {MENU_ITEMS.map(function (item) {
                return (
                  <button
                    key={item.id}
                    onClick={function () { if (!item.soon) handleItem(item.id); }}
                    style={{
                      width: "100%",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "9px 14px",
                      background: "none", border: "none",
                      cursor: item.soon ? "default" : "pointer",
                      fontFamily: "'Inter', system-ui, sans-serif",
                      fontSize: 13,
                      color: item.soon ? C.textMuted : C.textSub,
                      textAlign: "left",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <span style={{ fontSize: 11, opacity: 0.55 }}>{item.icon}</span>
                      {item.label}
                    </span>
                    {item.soon && (
                      <span style={{
                        fontSize: 8, fontWeight: 700, color: C.textMuted,
                        background: C.bgCardAlt, border: "1px solid " + C.border,
                        borderRadius: 8, padding: "2px 6px",
                        textTransform: "uppercase", letterSpacing: "0.05em",
                      }}>
                        Soon
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Sign out */}
            <div style={{ borderTop: "1px solid " + C.border, padding: "5px 0 4px" }}>
              <button
                onClick={function () { handleItem("signout"); }}
                style={{
                  width: "100%", padding: "9px 14px",
                  background: "none", border: "none",
                  cursor: "pointer", textAlign: "left",
                  fontFamily: "'Inter', system-ui, sans-serif",
                  fontSize: 13, color: C.red,
                  display: "flex", alignItems: "center", gap: 9,
                }}
              >
                <span style={{ fontSize: 11, opacity: 0.55 }}>→</span>
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>

      {showProfile && (
        <ProfileModal userMeta={userMeta} onClose={function () { setProfile(false); }} />
      )}
    </>
  );
}
