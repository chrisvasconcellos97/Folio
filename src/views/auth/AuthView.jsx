import { useState } from "react";
import { C } from "../../lib/colors";
import { PipOrb } from "../../components/PipMark";
import { AmberBtn } from "../../components/Buttons";
import { InputField } from "../../components/InputField";
import { HexField } from "../../lib/hexMotif";

function passwordStrength(pw) {
  if (!pw) return null;
  var hasMin    = pw.length >= 8;
  var hasUpper  = /[A-Z]/.test(pw);
  var hasNumber = /[0-9]/.test(pw);
  if (hasMin && hasUpper && hasNumber) return "strong";
  if (hasMin && (hasUpper || hasNumber))  return "fair";
  return "weak";
}

var STRENGTH_COLORS = { weak: C.red, fair: C.yellow, strong: C.green };
var STRENGTH_WIDTHS = { weak: "33%", fair: "66%", strong: "100%" };

export function AuthView({ onSignIn, onSignUp }) {
  var [mode, setMode]           = useState("login");
  var [email, setEmail]         = useState("");
  var [password, setPassword]   = useState("");
  var [name, setName]           = useState("");
  var [title, setTitle]         = useState("");
  var [loading, setLoading]     = useState(false);
  var [error, setError]         = useState(null);
  var [success, setSuccess]     = useState(null);

  var strength = mode === "signup" ? passwordStrength(password) : null;

  function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (mode === "signup") {
      if (!password || password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
        setError("Password needs at least one uppercase letter and one number.");
        return;
      }
    }

    setLoading(true);

    if (mode === "login") {
      onSignIn(email, password)
        .then(function (result) {
          setLoading(false);
          if (result.error) setError("Couldn't sign in. Check your email and password.");
        })
        .catch(function (err) {
          setLoading(false);
          setError(err.message && err.message.toLowerCase().includes("network")
            ? "Couldn't connect. Check your signal."
            : "Something went wrong. Try again.");
        });
    } else {
      onSignUp(email, password, { full_name: name, title: title })
        .then(function (result) {
          setLoading(false);
          if (result.error) {
            setError("Couldn't create account. " + (result.error.message || "Try again."));
          } else {
            setSuccess("Check your email to confirm your account, then sign in.");
            setMode("login");
          }
        })
        .catch(function (err) {
          setLoading(false);
          setError(err.message && err.message.toLowerCase().includes("network")
            ? "Couldn't connect. Check your signal."
            : "Something went wrong. Try again.");
        });
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 20px",
        position: "relative",
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      {/* Hex lattice watermark */}
      <HexField peak={0.06} />

      {/* Pip orb — big, centered, above the card */}
      <PipOrb
        size="xxl"
        style={{
          flexShrink: 0,
          width:     "clamp(200px, 38vmin, 280px)",
          height:    "clamp(200px, 38vmin, 280px)",
          boxShadow: "0 0 120px var(--accent-shadow)",
          position: "relative",
          zIndex: 1,
        }}
      />

      {/* Card — Folios title as header, form below, no overlap with orb */}
      <div
        style={{
          marginTop: 28,
          width: "100%",
          maxWidth: 380,
          background: C.bgCard,
          border: "1px solid " + C.border,
          borderRadius: 20,
          boxShadow: "0 4px 48px rgba(0,0,0,0.45)",
          overflow: "hidden",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Card header — wordmark */}
        <div
          style={{
            textAlign: "center",
            padding: "28px 24px 22px",
            borderBottom: "1px solid " + C.border,
          }}
        >
          <div
            style={{
              fontSize: 32,
              fontWeight: 700,
              fontFamily: "'Fraunces', Georgia, serif",
              color: C.text,
              letterSpacing: "-0.01em",
              lineHeight: 1,
            }}
          >
            Folios
          </div>
          <div
            style={{
              fontSize: 10,
              color: C.textMuted,
              letterSpacing: "0.18em",
              marginTop: 8,
              textTransform: "uppercase",
              fontFamily: "'Inter', system-ui, sans-serif",
              fontWeight: 500,
            }}
          >
            Account Management
          </div>
        </div>

        {/* Card form body */}
        <div style={{ padding: "24px 24px 28px" }}>

          {/* Mode toggle */}
          <div
            style={{
              display: "flex",
              background: "rgba(0,0,0,0.25)",
              borderRadius: 10,
              padding: 3,
              marginBottom: 24,
            }}
          >
            {["login", "signup"].map(function (m) {
              return (
                <button
                  key={m}
                  onClick={function () { setMode(m); setError(null); setSuccess(null); }}
                  style={{
                    flex: 1,
                    padding: "7px 0",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: "'Inter', system-ui, sans-serif",
                    textTransform: "capitalize",
                    background: mode === m ? C.bgCardAlt : "transparent",
                    color: mode === m ? C.accent : C.textMuted,
                    border: "1px solid " + (mode === m ? C.border : "transparent"),
                  }}
                >
                  {m === "login" ? "Sign In" : "Create Account"}
                </button>
              );
            })}
          </div>

          <form onSubmit={handleSubmit}>
            {mode === "signup" && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Full Name
                </div>
                <InputField
                  value={name}
                  onChange={function (e) { setName(e.target.value); }}
                  placeholder="Your name"
                />
              </div>
            )}

            {mode === "signup" && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Title / Role
                </div>
                <InputField
                  value={title}
                  onChange={function (e) { setTitle(e.target.value); }}
                  placeholder="e.g. Regional Account Manager"
                />
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Email
              </div>
              <InputField
                type="email"
                value={email}
                onChange={function (e) { setEmail(e.target.value); }}
                placeholder="you@company.com"
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Password
              </div>
              <InputField
                type="password"
                value={password}
                onChange={function (e) { setPassword(e.target.value); }}
                placeholder="••••••••"
              />
              {strength && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ height: 3, background: C.border, borderRadius: 2, overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      width: STRENGTH_WIDTHS[strength],
                      background: STRENGTH_COLORS[strength],
                      borderRadius: 2,
                      transition: "width 0.2s, background 0.2s",
                    }} />
                  </div>
                  <div style={{ fontSize: 10, color: STRENGTH_COLORS[strength], marginTop: 3, textTransform: "capitalize" }}>
                    {strength === "strong" ? "Strong" : strength === "fair" ? "Fair — add a number or uppercase" : "Weak — min 8 chars, uppercase, number"}
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div
                role="alert"
                aria-live="polite"
                style={{
                  background: C.redFaint,
                  border: "1px solid " + C.redLine,
                  borderRadius: 8,
                  padding: "10px 14px",
                  fontSize: 12,
                  color: C.red,
                  marginBottom: 16,
                }}
              >
                {error}
              </div>
            )}

            {success && (
              <div
                style={{
                  background: C.accentFaint,
                  border: "1px solid " + C.accentLine,
                  borderRadius: 8,
                  padding: "10px 14px",
                  fontSize: 12,
                  color: C.green,
                  marginBottom: 16,
                }}
              >
                {success}
              </div>
            )}

            <AmberBtn
              type="submit"
              style={{ width: "100%", fontSize: 14, padding: "11px 0" }}
              disabled={loading}
            >
              {loading ? "..." : (mode === "login" ? "Sign In" : "Create Account")}
            </AmberBtn>
          </form>
        </div>{/* end card form body */}
      </div>{/* end card */}

      {/* Footer */}
      <div
        style={{
          marginTop: 20,
          fontSize: 11,
          color: C.textMuted,
          fontFamily: "'Inter', system-ui, sans-serif",
          letterSpacing: "0.04em",
          position: "relative",
          zIndex: 1,
        }}
      >
        Pip is standing by.
      </div>
    </div>
  );
}
