import { useState } from "react";
import { theme } from "../theme.js";
import { APP_ACCESS_CODE } from "../auth/appAccess.js";

const bodyFont = theme.fontSans;

export function AppAccessScreen({ onUnlock }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    const ok = value.trim() === APP_ACCESS_CODE;
    if (ok) {
      setError(false);
      onUnlock();
    } else {
      setError(true);
      setValue("");
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: `linear-gradient(165deg, ${theme.bg} 0%, ${theme.bgDeep} 55%, #120e1c 100%)`,
        color: theme.text,
        fontFamily: bodyFont,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 360,
          padding: "28px 24px",
          borderRadius: 16,
          border: `1px solid ${theme.border}`,
          background: theme.surface,
          boxShadow: theme.shadow,
        }}
      >
        <h1 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 800, letterSpacing: "-0.3px" }}>
          Beläggning
        </h1>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: theme.textMuted, lineHeight: 1.45 }}>
          Ange kod för att öppna planeringsverktyget.
        </p>
        <label htmlFor="access-code" style={{ display: "block", fontSize: 12, fontWeight: 600, color: theme.textSoft, marginBottom: 8 }}>
          Kod
        </label>
        <input
          id="access-code"
          type="password"
          autoComplete="current-password"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(false);
          }}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "12px 14px",
            borderRadius: 10,
            border: `1px solid ${error ? theme.warn : theme.border}`,
            background: theme.surface2,
            color: theme.text,
            fontSize: 15,
            fontFamily: bodyFont,
            outline: "none",
          }}
        />
        {error ? (
          <p style={{ margin: "10px 0 0", fontSize: 12, color: theme.warn }}>Fel kod. Försök igen.</p>
        ) : null}
        <button
          type="submit"
          style={{
            marginTop: 20,
            width: "100%",
            padding: "12px 16px",
            borderRadius: 10,
            border: "none",
            background: `linear-gradient(135deg, ${theme.accentBlue}, ${theme.accentViolet})`,
            color: "#fff",
            fontSize: 14,
            fontWeight: 700,
            fontFamily: bodyFont,
            cursor: "pointer",
          }}
        >
          Fortsätt
        </button>
      </form>
    </div>
  );
}
