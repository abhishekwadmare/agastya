import { createContext, useCallback, useContext, useEffect, useState } from "react";
import PropTypes from "prop-types";

const DataContext = createContext(null);

const EMPTY_JOBS = { last_scraped: null, jobs: [] };
const EMPTY_ALERTS = { alerts: [] };
const EMPTY_COMPANIES = { companies: [] };
const EMPTY_APPLICATIONS = { applications: [] };

export function DataProvider({ children }) {
  const [jobsData, setJobsData] = useState(EMPTY_JOBS);
  const [alertsData, setAlertsData] = useState(EMPTY_ALERTS);
  const [companiesData, setCompaniesData] = useState(EMPTY_COMPANIES);
  const [applicationsData, setApplicationsData] = useState(EMPTY_APPLICATIONS);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    const base = import.meta.env.BASE_URL;
    // cache-bust so admin changes show up without a hard refresh
    const bust = `?t=${Date.now()}`;
    return Promise.all([
      fetch(`${base}data/jobs.json${bust}`).then((r) => r.json()).catch(() => EMPTY_JOBS),
      fetch(`${base}data/alerts.json${bust}`).then((r) => r.json()).catch(() => EMPTY_ALERTS),
      fetch(`${base}data/companies.json${bust}`).then((r) => r.json()).catch(() => EMPTY_COMPANIES),
      fetch(`${base}data/applications.json${bust}`)
        .then((r) => r.json())
        .catch(() => EMPTY_APPLICATIONS),
    ]).then(([jobs, alerts, companies, applications]) => {
      setJobsData(jobs);
      setAlertsData(alerts);
      setCompaniesData(companies);
      setApplicationsData(applications);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <DataContext.Provider
      value={{ jobsData, alertsData, companiesData, applicationsData, loading, reload }}
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
