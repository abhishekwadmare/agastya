import { useMemo, useState } from "react";
import Grid from "@mui/material/Grid";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Icon from "@mui/material/Icon";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDButton from "components/MDButton";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import ComplexStatisticsCard from "examples/Cards/StatisticsCards/ComplexStatisticsCard";

import { useAuth } from "context/AuthContext.jsx";
import { useData } from "context/DataContext.jsx";
import { callWorker } from "lib/callWorker.js";
import { isAdmin, requireAdmin } from "lib/roles.js";
import { BOOTSTRAP_ADMIN_EMAIL } from "../../config.js";
import StatusSnackbar from "components/StatusSnackbar.jsx";
import JobRow from "layouts/jobs/components/JobRow.jsx";
import ScrapeFrequencyControl from "layouts/jobs/components/ScrapeFrequencyControl.jsx";

const LOCAL_APPLIED_KEY = "agastya_locally_marked_applied";

function readLocalApplied() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_APPLIED_KEY) || "[]");
  } catch {
    return [];
  }
}

function timeAgo(isoString) {
  if (!isoString) return "never";
  const diffMs = Date.now() - new Date(isoString).getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function Jobs() {
  const { idToken, email } = useAuth();
  const { jobsData, companiesData, applicationsData, adminsData, settingsData, loading, reload } =
    useData();
  const canManage = isAdmin(email, adminsData, BOOTSTRAP_ADMIN_EMAIL);
  const [locallyApplied, setLocallyApplied] = useState(readLocalApplied());
  const [activeCompany, setActiveCompany] = useState("all");
  const [fetching, setFetching] = useState(false);
  const [fetchStatus, setFetchStatus] = useState(null);

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

  async function handleApply(job) {
    const updated = Array.from(new Set([...locallyApplied, job.id]));
    setLocallyApplied(updated);
    localStorage.setItem(LOCAL_APPLIED_KEY, JSON.stringify(updated));

    if (!idToken) return; // local-only marking for signed-out visitors
    try {
      await callWorker("/api/mark-applied", idToken, { jobId: job.id });
    } catch {
      // best-effort - the local mark above already succeeded, so the
      // user's own view stays consistent even if this sync fails.
    }
  }

  async function handleFetchJobs() {
    setFetchStatus(null);
    if (!requireAdmin({ idToken, email, canManage, setStatus: setFetchStatus })) return;
    setFetching(true);
    try {
      await callWorker("/api/fetch-jobs", idToken, {});
      setFetchStatus({
        type: "success",
        text: "Scraper triggered - check back in a minute or two, then refresh.",
      });
    } catch (err) {
      setFetchStatus({ type: "error", text: err.message });
    } finally {
      setFetching(false);
    }
  }

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={4}>
            <ComplexStatisticsCard
              color="info"
              icon="work"
              title="Jobs tracked"
              count={jobsData.jobs.length}
              percentage={{ color: "info", amount: "", label: "across all watched companies" }}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <ComplexStatisticsCard
              color="success"
              icon="business"
              title="Companies watched"
              count={companiesData.companies.length}
              percentage={{ color: "success", amount: "", label: "career pages tracked" }}
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <ComplexStatisticsCard
              color="dark"
              icon="update"
              title="Last scraped"
              count={timeAgo(jobsData.last_scraped)}
              percentage={{ color: "dark", amount: "", label: "most recent scan" }}
            />
          </Grid>
        </Grid>

        <MDBox
          mt={3}
          mb={2}
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          flexWrap="wrap"
          gap={2}
        >
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {companies.map((c) => (
              <Chip
                key={c}
                label={c === "all" ? "All" : c}
                color={activeCompany === c ? "info" : "default"}
                onClick={() => setActiveCompany(c)}
                sx={{ mb: 1 }}
              />
            ))}
          </Stack>

          <MDBox display="flex" alignItems="center" gap={1} flexWrap="wrap">
            <ScrapeFrequencyControl
              idToken={idToken}
              email={email}
              canManage={canManage}
              currentValue={settingsData.scrape_frequency_hours}
              loading={loading}
              onSaved={reload}
              onStatus={setFetchStatus}
            />

            <MDButton
              variant="gradient"
              color="dark"
              size="small"
              onClick={handleFetchJobs}
              disabled={fetching}
              sx={{ opacity: canManage ? 1 : 0.6 }}
            >
              <Icon sx={{ mr: 0.5 }}>{fetching ? "hourglass_top" : "sync"}</Icon>
              {fetching ? "Fetching…" : "Fetch jobs now"}
            </MDButton>
          </MDBox>
        </MDBox>

        {loading && (
          <MDTypography variant="button" color="text">
            Loading jobs…
          </MDTypography>
        )}

        {!loading && visibleJobs.length === 0 && (
          <MDBox
            border="1px dashed"
            borderColor="grey.400"
            borderRadius="lg"
            p={4}
            textAlign="center"
          >
            <MDTypography variant="button" color="text">
              No jobs yet. The scraper runs on a schedule — check back after the next scan, or add
              a company on the Companies page.
            </MDTypography>
          </MDBox>
        )}

        <MDBox>
          {visibleJobs.map((job) => (
            <JobRow key={job.id} job={job} applied={appliedIds.has(job.id)} onApply={handleApply} />
          ))}
        </MDBox>
      </MDBox>
      <StatusSnackbar status={fetchStatus} onClose={() => setFetchStatus(null)} />
      <Footer />
    </DashboardLayout>
  );
}
