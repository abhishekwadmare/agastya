import React, { useEffect, useRef, useState } from "react";
import { GOOGLE_CLIENT_ID, WORKER_BASE_URL } from "../config.js";

async function callWorker(path, idToken, extraPayload) {
  const resp = await fetch(`${WORKER_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken, ...extraPayload }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

const emptyAlertForm = {
  id: "",
  company: "",
  workday_tenant: "",
  workday_site: "",
  keywords_any: "",
  keywords_exclude: "",
  location_filter: "",
};

export default function AdminPanel({ alerts, onChanged }) {
  const buttonRef = useRef(null);
  const [idToken, setIdToken] = useState(null);
  const [email, setEmail] = useState(null);
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState(emptyAlertForm);

  useEffect(() => {
    if (!window.google || !buttonRef.current) return;

    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (response) => {
        // response.credential is the Google ID token (JWT). We don't
        // trust it client-side - the Worker re-verifies it server-side
        // on every write. Client-side decode here is only for display.
        setIdToken(response.credential);
        try {
          const payload = JSON.parse(atob(response.credential.split(".")[1]));
          setEmail(payload.email);
        } catch {
          setEmail(null);
        }
      },
    });
    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: "filled_black",
      size: "medium",
      text: "signin_with",
    });
  }, []);

  function signOut() {
    setIdToken(null);
    setEmail(null);
    window.google?.accounts.id.disableAutoSelect();
  }

  async function handleAddAlert(e) {
    e.preventDefault();
    setStatus(null);
    try {
      await callWorker("/api/add-alert", idToken, {
        alert: {
          id: form.id.trim(),
          company: form.company.trim(),
          workday_tenant: form.workday_tenant.trim(),
          workday_site: form.workday_site.trim(),
          keywords_any: form.keywords_any.split(",").map((k) => k.trim()).filter(Boolean),
          keywords_exclude: form.keywords_exclude.split(",").map((k) => k.trim()).filter(Boolean),
          location_filter: form.location_filter.trim(),
        },
      });
      setStatus({ type: "success", text: `Added alert '${form.id}'.` });
      setForm(emptyAlertForm);
      onChanged();
    } catch (err) {
      setStatus({ type: "error", text: err.message });
    }
  }

  async function handleDeleteAlert(id) {
    setStatus(null);
    try {
      await callWorker("/api/delete-alert", idToken, { id });
      setStatus({ type: "success", text: `Deleted alert '${id}'.` });
      onChanged();
    } catch (err) {
      setStatus({ type: "error", text: err.message });
    }
  }

  return (
    <div
      style={{
        border: "1px solid var(--hairline)",
        borderRadius: 4,
        padding: "16px 20px",
        marginBottom: 20,
        background: "var(--surface)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--text-dim)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Admin
        </div>
        {!idToken ? (
          <div ref={buttonRef} />
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--success)" }}>
              {email}
            </span>
            <button
              onClick={signOut}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                background: "transparent",
                border: "1px solid var(--hairline)",
                color: "var(--text-secondary)",
                borderRadius: 3,
                padding: "4px 8px",
                cursor: "pointer",
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </div>

      {idToken && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            {alerts.map((a) => (
              <div
                key={a.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  color: "var(--text-secondary)",
                }}
              >
                <span>
                  {a.id} — {a.company}
                </span>
                <button
                  onClick={() => handleDeleteAlert(a.id)}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--danger)",
                    color: "var(--danger)",
                    borderRadius: 3,
                    padding: "2px 8px",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  delete
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={handleAddAlert} style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <input placeholder="alert id (unique)" value={form.id}
                onChange={(e) => setForm({ ...form, id: e.target.value })} style={inputStyle} required />
              <input placeholder="company name" value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })} style={inputStyle} required />
              <input placeholder="workday tenant" value={form.workday_tenant}
                onChange={(e) => setForm({ ...form, workday_tenant: e.target.value })} style={inputStyle} required />
              <input placeholder="workday site" value={form.workday_site}
                onChange={(e) => setForm({ ...form, workday_site: e.target.value })} style={inputStyle} required />
              <input placeholder="keywords, comma separated" value={form.keywords_any}
                onChange={(e) => setForm({ ...form, keywords_any: e.target.value })} style={inputStyle} />
              <input placeholder="exclude keywords, comma separated" value={form.keywords_exclude}
                onChange={(e) => setForm({ ...form, keywords_exclude: e.target.value })} style={inputStyle} />
            </div>
            <button
              type="submit"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                background: "var(--accent)",
                color: "var(--bg)",
                border: "none",
                borderRadius: 3,
                padding: "8px 14px",
                cursor: "pointer",
                justifySelf: "start",
              }}
            >
              Add alert
            </button>
          </form>
        </div>
      )}

      {status && (
        <div
          style={{
            marginTop: 10,
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: status.type === "error" ? "var(--danger)" : "var(--success)",
          }}
        >
          {status.text}
        </div>
      )}
    </div>
  );
}

const inputStyle = {
  background: "var(--surface-raised)",
  border: "1px solid var(--hairline)",
  borderRadius: 3,
  color: "var(--text-primary)",
  padding: "8px 10px",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
};
