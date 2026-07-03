import React from "react";

function formatLastScraped(isoString) {
  if (!isoString) return "not yet run";
  const d = new Date(isoString);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SweepBar({ lastScraped, jobCount }) {
  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        background: "var(--surface)",
        border: "1px solid var(--hairline)",
        borderRadius: 4,
        padding: "14px 20px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          height: "100%",
          width: "40%",
          background:
            "linear-gradient(90deg, transparent, rgba(238,193,100,0.14), transparent)",
          animation: "sweep 4s linear infinite",
        }}
      />
      <style>{`
        @keyframes sweep {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(250%); }
        }
      `}</style>

      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "var(--text-secondary)",
          zIndex: 1,
        }}
      >
        BEARING TAKEN&nbsp;
        <span style={{ color: "var(--accent)" }}>{formatLastScraped(lastScraped)}</span>
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "var(--text-secondary)",
          zIndex: 1,
        }}
      >
        {jobCount} SIGNAL{jobCount === 1 ? "" : "S"} TRACKED
      </div>
    </div>
  );
}
