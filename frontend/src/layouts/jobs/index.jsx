import { useMemo, useState } from "react";
import Grid from "@mui/material/Grid";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import ComplexStatisticsCard from "examples/Cards/StatisticsCards/ComplexStatisticsCard";

import { useData } from "context/DataContext.jsx";
import JobRow from "layouts/jobs/components/JobRow.jsx";

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
  const { jobsData, companiesData, applicationsData, loading } = useData();
  const [locallyApplied, setLocallyApplied] = useState(readLocalApplied());
  const [activeCompany, setActiveCompany] = useState("all");

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

        <MDBox mt={3} mb={2}>
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
      <Footer />
    </DashboardLayout>
  );
}
