import { createContext, useCallback, useContext, useEffect, useState } from "react";
import PropTypes from "prop-types";
import { WORKER_BASE_URL } from "../config.js";
import { useAuth } from "./AuthContext.jsx";

const DataContext = createContext(null);

const EMPTY_JOBS = { last_scraped: null, jobs: [] };
const EMPTY_ALERTS = { alerts: [] };
const EMPTY_COMPANIES = { companies: [] };
const EMPTY_APPLICATIONS = { applications: [] };
const EMPTY_ADMINS = { admins: [] };
const EMPTY_SETTINGS = { scrape_frequency_hours: 4 };

export function DataProvider({ children }) {
  const { idToken } = useAuth();
  const [jobsData, setJobsData] = useState(EMPTY_JOBS);
  const [alertsData, setAlertsData] = useState(EMPTY_ALERTS);
  const [companiesData, setCompaniesData] = useState(EMPTY_COMPANIES);
  const [applicationsData, setApplicationsData] = useState(EMPTY_APPLICATIONS);
  const [adminsData, setAdminsData] = useState(EMPTY_ADMINS);
  const [settingsData, setSettingsData] = useState(EMPTY_SETTINGS);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    const base = import.meta.env.BASE_URL;
    // cache-bust so admin changes show up without a hard refresh
    const bust = `?t=${Date.now()}`;
    // alerts/applications are owner-filtered server-side (see issue #7)
    // - no token means an empty list back, not an error, so signed-out
    // visitors just see nothing instead of a fetch failure.
    const tokenParam = idToken ? `&idToken=${encodeURIComponent(idToken)}` : "";
    return Promise.all([
      // jobs/companies are R2-backed, served through the Worker instead
      // of static files - see issue #7
      fetch(`${WORKER_BASE_URL}/api/jobs${bust}`).then((r) => r.json()).catch(() => EMPTY_JOBS),
      fetch(`${WORKER_BASE_URL}/api/alerts${bust}${tokenParam}`)
        .then((r) => r.json())
        .catch(() => EMPTY_ALERTS),
      fetch(`${WORKER_BASE_URL}/api/companies${bust}`)
        .then((r) => r.json())
        .catch(() => EMPTY_COMPANIES),
      fetch(`${WORKER_BASE_URL}/api/applications${bust}${tokenParam}`)
        .then((r) => r.json())
        .catch(() => EMPTY_APPLICATIONS),
      fetch(`${base}data/admins.json${bust}`).then((r) => r.json()).catch(() => EMPTY_ADMINS),
      fetch(`${WORKER_BASE_URL}/api/settings${bust}`)
        .then((r) => r.json())
        .catch(() => EMPTY_SETTINGS),
    ]).then(([jobs, alerts, companies, applications, admins, settings]) => {
      setJobsData(jobs);
      setAlertsData(alerts);
      setCompaniesData(companies);
      setApplicationsData(applications);
      setAdminsData(admins);
      setSettingsData(settings);
      setLoading(false);
    });
  }, [idToken]);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <DataContext.Provider
      value={{
        jobsData,
        alertsData,
        companiesData,
        applicationsData,
        adminsData,
        settingsData,
        loading,
        reload,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

DataProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within a DataProvider");
  return ctx;
}
