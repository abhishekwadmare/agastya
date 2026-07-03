import React from "react";

function timeAgo(isoString) {
  if (!isoString) return "unknown";
  const diffMs = Date.now() - new Date(isoString).getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function JobCard({ job, applied, onApply }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        padding: "18px 20px",
        background: "var(--surface)",
        border: "1px solid var(--hairline)",
        borderLeft: applied ? "3px solid var(--success)" : "3px solid var(--accent)",
        borderRadius: 4,
        alignItems: "center",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-dim)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: 4,
          }}
        >
          {job.company} · {job.location} · detected {timeAgo(job.first_seen)}
        </div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 17,
            fontWeight: 600,
            color: "var(--text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {job.title}
        </div>
      </div>

      {applied && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--success)",
            border: "1px solid var(--success)",
            borderRadius: 3,
            padding: "3px 8px",
            whiteSpace: "nowrap",
          }}
        >
          APPLIED
        </span>
      )}

      <a
        href={job.apply_url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onApply(job)}
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          fontWeight: 500,
          color: "var(--bg)",
          background: "var(--accent)",
          padding: "8px 14px",
          borderRadius: 3,
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        APPLY →
      </a>
    </div>
  );
}
