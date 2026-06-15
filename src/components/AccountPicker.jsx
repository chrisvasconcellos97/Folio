import { useState, useRef, useEffect, useCallback } from "react";
import { C } from "../lib/colors";

var MONO = "'JetBrains Mono', ui-monospace, monospace";

/**
 * AccountPicker — searchable account picker for all account dropdowns.
 *
 * Props:
 *   accounts      — array of { id, name, account_type, is_inactive }
 *   value         — currently selected account id (string) or null/"" for none
 *   onChange      — function(accountId: string|null) called when selection changes
 *   placeholder   — string shown when nothing is selected (default "Search accounts…")
 *   allowNone     — if true, adds a "— None —" option that calls onChange(null)
 *   noneLabel     — label for the none option (default "— None —")
 *   style         — optional container style override
 */
export function AccountPicker({ accounts, value, onChange, placeholder, allowNone, noneLabel, style }) {
  var resolvedPlaceholder = placeholder || "Search accounts…";
  var resolvedNoneLabel   = noneLabel   || "— None —";

  var activeAccounts = (accounts || []).filter(function (a) { return !a.is_inactive; });

  // Resolve the selected account for display against the FULL list (not just
  // active) so a task/cadence tied to a since-archived account still shows its
  // name instead of falling back to the placeholder.
  var selectedAccount = value ? (accounts || []).find(function (a) { return a.id === value; }) : null;

  var hasDepts    = activeAccounts.some(function (a) { return a.account_type === "internal_team"; });
  var hasPartners = activeAccounts.some(function (a) { return a.account_type === "partner"; });
  var showTabs    = hasDepts || hasPartners;

  function typeOf(a) {
    if (a.account_type === "internal_team") return "department";
    if (a.account_type === "partner")       return "partner";
    return "account";
  }

  var [open, setOpen]         = useState(false);
  var [query, setQuery]       = useState("");
  var [focused, setFocused]   = useState(-1); // -1 = none, 0 = noneOption (if allowNone), else 1-based into filtered
  var [typeFilter, setTypeFilter] = useState(function () {
    return selectedAccount ? typeOf(selectedAccount) : "account";
  });

  var inputRef    = useRef(null);
  var containerRef = useRef(null);

  // Close on outside click
  useEffect(function () {
    if (!open) return;
    function handleClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
        setFocused(-1);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return function () { document.removeEventListener("mousedown", handleClick); };
  }, [open]);

  // Filtered list — type-scoped first, then by search query
  var typeFiltered = showTabs
    ? activeAccounts.filter(function (a) { return typeOf(a) === typeFilter; })
    : activeAccounts;
  var filtered = query.trim()
    ? typeFiltered.filter(function (a) { return (a.name || "").toLowerCase().includes(query.toLowerCase()); })
    : typeFiltered;

  function openPicker() {
    setOpen(true);
    setQuery("");
    setFocused(-1);
    setTypeFilter(selectedAccount ? typeOf(selectedAccount) : "account");
    // focus input on next tick
    setTimeout(function () { if (inputRef.current) inputRef.current.focus(); }, 0);
  }

  function closePicker() {
    setOpen(false);
    setQuery("");
    setFocused(-1);
  }

  function selectAccount(id) {
    onChange(id || null);
    closePicker();
  }

  function handleKeyDown(e) {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        openPicker();
      }
      return;
    }

    // Total navigable items: allowNone ? filtered.length + 1 : filtered.length
    var total = filtered.length + (allowNone ? 1 : 0);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocused(function (f) { return Math.min(f + 1, total - 1); });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocused(function (f) { return Math.max(f - 1, allowNone ? 0 : 0); });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (allowNone && focused === 0) {
        selectAccount(null);
      } else {
        var idx = allowNone ? focused - 1 : focused;
        if (idx >= 0 && idx < filtered.length) {
          selectAccount(filtered[idx].id);
        }
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      closePicker();
    }
  }

  function clearSelection(e) {
    e.stopPropagation();
    onChange(null);
  }

  // Closed state: display chip
  if (!open) {
    return (
      <div ref={containerRef} style={Object.assign({ position: "relative" }, style)}>
        <button
          type="button"
          onClick={openPicker}
          onKeyDown={handleKeyDown}
          aria-haspopup="listbox"
          aria-expanded="false"
          style={{
            width: "100%",
            background: C.surface,
            border: "1px solid " + C.rule,
            borderRadius: 8,
            padding: "9px 12px",
            fontSize: 16,
            fontFamily: MONO,
            color: selectedAccount ? C.text : C.textMuted,
            cursor: "pointer",
            textAlign: "left",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            outline: "none",
          }}
        >
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {selectedAccount ? selectedAccount.name : resolvedPlaceholder}
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            {selectedAccount && (
              <span
                onClick={clearSelection}
                role="button"
                aria-label="Clear selection"
                style={{ fontSize: 13, color: C.textMuted, lineHeight: 1, padding: "0 2px", cursor: "pointer" }}
              >
                ×
              </span>
            )}
            <span style={{ opacity: 0.4, fontSize: 10 }}>▼</span>
          </span>
        </button>
      </div>
    );
  }

  // Open state: input + dropdown
  return (
    <div ref={containerRef} style={Object.assign({ position: "relative" }, style)}>
      {/* Workspace type tabs */}
      {showTabs && (
        <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
          {[
            { key: "account",    label: "Accounts" },
            hasDepts    && { key: "department", label: "Departments" },
            hasPartners && { key: "partner",    label: "Partners" },
          ].filter(Boolean).map(function (tab) {
            var active = typeFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={function () { setTypeFilter(tab.key); setQuery(""); setFocused(-1); }}
                style={{
                  flex: 1,
                  padding: "5px 0",
                  borderRadius: 6,
                  border: "1px solid " + (active ? C.accent : C.rule),
                  background: active ? C.accentFaint : "transparent",
                  color: active ? C.accent : C.textMuted,
                  fontSize: 11,
                  fontFamily: MONO,
                  cursor: "pointer",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Search input */}
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={function (e) { setQuery(e.target.value); setFocused(-1); }}
        onKeyDown={handleKeyDown}
        placeholder={selectedAccount ? selectedAccount.name : resolvedPlaceholder}
        aria-label="Search accounts"
        aria-haspopup="listbox"
        aria-expanded="true"
        style={{
          width: "100%",
          boxSizing: "border-box",
          background: C.surface,
          border: "1px solid " + C.accent,
          borderRadius: 8,
          padding: "9px 12px",
          fontSize: 16,
          fontFamily: MONO,
          color: C.text,
          outline: "none",
        }}
      />

      {/* Dropdown list */}
      <div
        role="listbox"
        style={{
          position: "absolute",
          top: "calc(100% + 4px)",
          left: 0,
          right: 0,
          background: C.bgDropdown,
          border: "1px solid " + C.rule,
          borderRadius: 8,
          zIndex: 100,
          maxHeight: 220,
          overflowY: "auto",
          padding: "4px 0",
          boxShadow: "0 4px 16px var(--c-overlay-shadow, rgba(0,0,0,0.3))",
        }}
      >
        {/* None option */}
        {allowNone && (
          <div
            role="option"
            aria-selected={!value}
            onClick={function () { selectAccount(null); }}
            onMouseEnter={function () { setFocused(0); }}
            style={{
              padding: "8px 12px",
              fontSize: 13,
              fontFamily: MONO,
              color: C.textMuted,
              cursor: "pointer",
              background: focused === 0 ? C.surface : "transparent",
              userSelect: "none",
            }}
          >
            {resolvedNoneLabel}
          </div>
        )}

        {filtered.length === 0 && (
          <div style={{ padding: "10px 12px", fontSize: 12, color: C.textMuted, fontFamily: MONO }}>
            No accounts found
          </div>
        )}

        {filtered.map(function (a, idx) {
          var listIdx = allowNone ? idx + 1 : idx;
          var isFocused = focused === listIdx;
          var isSelected = a.id === value;
          return (
            <div
              key={a.id}
              role="option"
              aria-selected={isSelected}
              onClick={function () { selectAccount(a.id); }}
              onMouseEnter={function () { setFocused(listIdx); }}
              style={{
                padding: "8px 12px",
                fontSize: 13,
                fontFamily: MONO,
                color: isSelected ? C.accent : C.text,
                background: isFocused ? C.surface : isSelected ? "var(--c-accent-faint)" : "transparent",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                userSelect: "none",
              }}
            >
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {a.name}
              </span>
              {isSelected && (
                <span style={{ fontSize: 11, color: C.accent, flexShrink: 0, marginLeft: 8 }}>✓</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
