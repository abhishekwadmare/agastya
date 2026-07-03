import React, { useEffect, useMemo, useState } from "react";
import JobCard from "./components/JobCard.jsx";
import SweepBar from "./components/SweepBar.jsx";
import AdminPanel from "./components/AdminPanel.jsx";

const LOCAL_APPLIED_KEY = "agastya_locally_marked_applied";

function readLocalApplied() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_APPLIED_KEY) || "[]");
  } catch {
    return [];
  }
}

export default function App() {
  const [jobsData, setJobsData] = useState({ last_scraped: null, jobs: [] });
  const [alertsData, setAlertsData] = useState({ alerts: [] });
  const [applicationsData, setApplicationsData] = useState({ applications: [] });
  const [locallyApplied, setLocallyApplied] = useState(readLocalApplied());
  const [activeCompany, setActiveCompany] = useState("all");
  const [loading, setLoading] = useState(true);

  function loadData() {
    const base = import.meta.env.BASE_URL;
    // cache-bust so admin changes show up without a hard refresh
    const bust = `?t=${Date.now()}`;
    return Promise.all([
      fetch(`${base}data/jobs.json${bust}`).then((r) => r.json()).catch(() => ({ last_scraped: null, jobs: [] })),
      fetch(`${base}data/alerts.json${bust}`).then((r) => r.json()).catch(() => ({ alerts: [] })),
      fetch(`${base}data/applications.json${bust}`).then((r) => r.json()).catch(() => ({ applications: [] })),
    ]).then(([jobs, alerts, applications]) => {
      setJobsData(jobs);
      setAlertsData(alerts);
      setApplicationsData(applications);
      setLoading(false);
    });
  }

  useEffect(() => {
    loadData();
  }, []);

  const appliedIds = useMemo(() => {
    const fromCli = new Set(applicationsData.applications.map((a) => a.job_id));
    locallyApplied.forEach((id) => fromCli.add(id));
    return fromCli;
  }, [applicationsData, locallyApplied]);

  const companies = useMemo(() => {
    const set = new Set(jobsData.jobs.map((j) => j.company));
    return ["all", ...Array.from(set)];
  }, [jobsData]);

  const visibleJobs = useMemo(() => {
    if (activeCompany === "all") return jobsData.jobs;
    return jobsData.jobs.filter((j) => j.company === activeCompany);
  }, [jobsData, activeCompany]);

  function handleApply(job) {
    const updated = Array.from(new Set([...locallyApplied, job.id]));
    setLocallyApplied(updated);
    localStorage.setItem(LOCAL_APPLIED_KEY, JSON.stringify(updated));
  }

  return (
    <div style={{ maxWidth: 880, margin: "0 auto", padding: "40px 20px 80px" }}>
      <header style={{ marginBottom: 28, position: "relative" }}>
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: -40,
            left: -60,
            width: 260,
            height: 260,
            background:
              "radial-gradient(circle, rgba(238,193,100,0.16) 0%, transparent 70%)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--accent)",
            letterSpacing: "0.12em",
            marginBottom: 6,
            position: "relative",
            zIndex: 1,
          }}
        >
          AGASTYA
        </div>
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 32,
            fontWeight: 700,
            margin: 0,
            color: "var(--text-primary)",
            position: "relative",
            zIndex: 1,
          }}
        >
          Career page signal tracker
        </h1>
        <p style={{ color: "var(--text-secondary)", marginTop: 8, maxWidth: 560 }}>
          Named for the sage tied to Canopus, the star long used to find a
          bearing when nothing else was visible. Watches company career
          pages directly and surfaces new postings before they reach job
          boards. Updated automatically every 4 hours.
        </p>
      </header>

      <SweepBar lastScraped={jobsData.last_scraped} jobCount={jobsData.jobs.length} />

      <div style={{ marginTop: 20 }}>
        <AdminPanel alerts={alertsData.alerts} onChanged={loadData} />
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          margin: "20px 0",
        }}
      >
        {companies.map((c) => (
          <button
            key={c}
            onClick={() => setActiveCompany(c)}
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              padding: "6px 12px",
              borderRadius: 3,
              border: `1px solid ${activeCompany === c ? "var(--accent)" : "var(--hairline)"}`,
              background: activeCompany === c ? "var(--accent-dim)" : "transparent",
              color: activeCompany === c ? "var(--accent)" : "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            {c === "all" ? "ALL" : c.toUpperCase()}
          </button>
        ))}
      </div>

      {loading && (
        <p style={{ color: "var(--text-dim)", fontFamily: "var(--font-mono)", fontSize: 13 }}>
          Loading signals…
        </p>
      )}

      {!loading && visibleJobs.length === 0 && (
        <div
          style={{
            border: "1px dashed var(--hairline)",
            borderRadius: 4,
            padding: "32px 20px",
            textAlign: "center",
            color: "var(--text-dim)",
          }}
        >
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 13, margin: 0 }}>
            No signals yet. The scraper runs on a schedule — check back after the
            next scan, or add an alert with the local admin CLI.
          </p>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {visibleJobs.map((job) => (
          <JobCard
            key={job.id}
            job={job}
            applied={appliedIds.has(job.id)}
            onApply={handleApply}
          />
        ))}
      </div>

      <footer
        style={{
          marginTop: 60,
          paddingTop: 20,
          borderTop: "1px solid var(--hairline)",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--text-dim)",
        }}
      >
        Tracking {alertsData.alerts.length} alert{alertsData.alerts.length === 1 ? "" : "s"} ·
        Read-only view. Alerts are managed locally by the site owner.
      </footer>
    </div>
  );
}
