import { useState } from "react";
import { C } from "../../lib/colors";
import { GaugeIcon } from "../../components/GaugeIcon";
import { InputField } from "../../components/InputField";

var GB     = "rgba(103,200,249,0.12)";
var GB_BDR = "rgba(103,200,249,0.28)";

export function AuthView({ onSignIn }) {
  var [email, setEmail]     = useState("");
  var [password, setPass]   = useState("");
  var [loading, setLoading] = useState(false);
  var [error, setError]     = useState(null);

  function handleSubmit(e) {
    e.preventDefault();
    if (!email || !password || loading) return;
    setError(null);
    setLoading(true);
    onSignIn(email, password).then(function (result) {
      setLoading(false);
      if (result.error) setError(result.error.message);
    }).catch(function (err) {
      setLoading(false);
      setError(err.message);
    });
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div style={{ width: "100%", maxWidth: 400 }}>

        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
            <div
              style={{
                width: 76,
                height: 76,
                borderRadius: 20,
                background: GB,
                border: "1px solid " + GB_BDR,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <GaugeIcon size={42} glow />
            </div>
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: C.text,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            GAUGE
          </div>
          <div
            style={{
              fontSize: 10,
              color: C.accent,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              marginTop: 5,
            }}
          >
            Project Management
          </div>
          <div
            style={{
              fontSize: 10,
              color: C.textMuted,
              marginTop: 4,
              letterSpacing: "0.08em",
            }}
          >
            part of Briefcase
          </div>
        </div>

        {/* Card */}
        <div
          style={{
            background: C.bgCard,
            border: "1px solid " + C.border,
            borderRadius: 16,
            padding: 28,
          }}
        >
          <div
            style={{
              fontSize: 13,
              color: C.textSub,
              marginBottom: 22,
              textAlign: "center",
            }}
          >
            Sign in with your Folio account
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontSize: 10,
                  color: C.textMuted,
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Email
              </div>
              <InputField
                type="email"
                value={email}
                onChange={function (e) { setEmail(e.target.value); }}
                placeholder="you@company.com"
                autoComplete="email"
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <div
                style={{
                  fontSize: 10,
                  color: C.textMuted,
                  marginBottom: 6,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Password
              </div>
              <InputField
                type="password"
                value={password}
                onChange={function (e) { setPass(e.target.value); }}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <div
                style={{
                  background: "rgba(248,113,113,0.1)",
                  border: "1px solid rgba(248,113,113,0.25)",
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

            <button
              type="submit"
              disabled={loading || !email || !password}
              style={{
                width: "100%",
                background: loading || !email || !password ? "rgba(103,200,249,0.05)" : GB,
                border: "1px solid " + (loading || !email || !password ? C.border : GB_BDR),
                borderRadius: 10,
                padding: "12px 0",
                fontSize: 14,
                fontWeight: 600,
                color: loading || !email || !password ? C.textMuted : C.accent,
                fontFamily: "'DM Sans', sans-serif",
                cursor: loading || !email || !password ? "default" : "pointer",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div
          style={{
            textAlign: "center",
            marginTop: 24,
            fontSize: 11,
            color: C.textMuted,
            letterSpacing: "0.05em",
          }}
        >
          Gauge · Briefcase Suite
        </div>
      </div>
    </div>
  );
}
