import { useState } from "react";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDButton from "components/MDButton";
import MDInput from "components/MDInput";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";

import { useAuth } from "context/AuthContext.jsx";
import { useData } from "context/DataContext.jsx";
import { callWorker } from "lib/callWorker.js";
import { parseWorkdayUrl } from "lib/parseWorkdayUrl.js";

const emptyAlertForm = {
  id: "",
  company: "",
  workday_tenant: "",
  workday_host: "wd1",
  workday_site: "",
  keywords_any: "",
  keywords_exclude: "",
  location_filter: "",
};

export default function Alerts() {
  const { idToken } = useAuth();
  const { alertsData, reload } = useData();

  const [status, setStatus] = useState(null);
  const [form, setForm] = useState(emptyAlertForm);
  const [pasteUrl, setPasteUrl] = useState("");
  const [parseNote, setParseNote] = useState(null);

  function handleParseUrl() {
    const parsed = parseWorkdayUrl(pasteUrl);
    if (!parsed) {
      setParseNote({
        type: "error",
        text: "Doesn't look like a myworkdayjobs.com URL - fill in the fields manually.",
      });
      return;
    }
    setForm((f) => ({
      ...f,
      workday_tenant: parsed.tenant,
      workday_host: parsed.host,
      workday_site: parsed.site,
      keywords_any: f.keywords_any || parsed.searchQuery,
    }));
    setParseNote({
      type: "success",
      text: `Parsed: tenant=${parsed.tenant}, host=${parsed.host}, site=${parsed.site}${
        parsed.searchQuery ? `, search="${parsed.searchQuery}"` : ""
      }. Double-check below, then set location/other keywords as needed.`,
    });
  }

  function requireSignIn() {
    if (idToken) return true;
    setStatus({
      type: "error",
      text: "Sign in with Google (top-right) to make changes - only the site owner's account is authorized.",
    });
    window.google?.accounts.id.prompt();
    return false;
  }

  async function handleAddAlert(e) {
    e.preventDefault();
    setStatus(null);
    if (!requireSignIn()) return;
    try {
      await callWorker("/api/add-alert", idToken, {
        alert: {
          id: form.id.trim(),
          company: form.company.trim(),
          workday_tenant: form.workday_tenant.trim(),
          workday_host: form.workday_host.trim() || "wd1",
          workday_site: form.workday_site.trim(),
          keywords_any: form.keywords_any.split(",").map((k) => k.trim()).filter(Boolean),
          keywords_exclude: form.keywords_exclude.split(",").map((k) => k.trim()).filter(Boolean),
          location_filter: form.location_filter.trim(),
        },
      });
      setStatus({ type: "success", text: `Added alert '${form.id}'.` });
      setForm(emptyAlertForm);
      reload();
    } catch (err) {
      setStatus({ type: "error", text: err.message });
    }
  }

  async function handleDeleteAlert(id) {
    setStatus(null);
    if (!requireSignIn()) return;
    try {
      await callWorker("/api/delete-alert", idToken, { id });
      setStatus({ type: "success", text: `Deleted alert '${id}'.` });
      reload();
    } catch (err) {
      setStatus({ type: "error", text: err.message });
    }
  }

  async function handleSyncJobsFile(e) {
    const file = e.target.files[0];
    e.target.value = ""; // allow re-selecting the same file next time
    if (!file) return;

    setStatus(null);
    if (!requireSignIn()) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed.jobs)) {
        throw new Error("That file doesn't look like a jobs.json - missing a 'jobs' array.");
      }
      const { added } = await callWorker("/api/sync-jobs", idToken, { jobs: parsed.jobs });
      setStatus({ type: "success", text: `Synced — added ${added} new job(s).` });
      reload();
    } catch (err) {
      setStatus({ type: "error", text: err.message });
    }
  }

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={5}>
            <Card>
              <MDBox p={3}>
                <MDTypography variant="h6" mb={2}>
                  Current alerts
                </MDTypography>
                {alertsData.alerts.length === 0 && (
                  <MDTypography variant="button" color="text">
                    No alerts yet — add one on the right.
                  </MDTypography>
                )}
                {alertsData.alerts.map((a) => (
                  <MDBox
                    key={a.id}
                    display="flex"
                    justifyContent="space-between"
                    alignItems="center"
                    py={1}
                    borderBottom="1px solid"
                    borderColor="grey.200"
                  >
                    <MDTypography variant="button">
                      {a.id} — {a.company}
                    </MDTypography>
                    <MDButton
                      variant="outlined"
                      color="error"
                      size="small"
                      onClick={() => handleDeleteAlert(a.id)}
                    >
                      Delete
                    </MDButton>
                  </MDBox>
                ))}

                <MDBox mt={3}>
                  <MDButton component="label" variant="gradient" color="dark" fullWidth>
                    Sync jobs from local watcher
                    <input type="file" accept=".json" hidden onChange={handleSyncJobsFile} />
                  </MDButton>
                  <MDTypography variant="caption" color="text" display="block" mt={1}>
                    Upload your local agastya-jobs.json to merge new finds into the live site.
                  </MDTypography>
                </MDBox>
              </MDBox>
            </Card>
          </Grid>

          <Grid item xs={12} md={7}>
            <Card>
              <MDBox p={3} component="form" onSubmit={handleAddAlert}>
                <MDTypography variant="h6" mb={0.5}>
                  Add an alert
                </MDTypography>
                {!idToken && (
                  <MDTypography variant="caption" color="text" display="block" mb={1.5}>
                    Anyone can fill this out, but adding it requires signing in with Google
                    (top-right) as the site owner.
                  </MDTypography>
                )}

                <MDBox display="flex" gap={1} mb={1} mt={idToken ? 2 : 0}>
                  <MDInput
                    label="Paste a Workday careers URL to auto-fill tenant/host/site"
                    value={pasteUrl}
                    onChange={(e) => setPasteUrl(e.target.value)}
                    fullWidth
                  />
                  <MDButton type="button" variant="outlined" color="dark" onClick={handleParseUrl}>
                    Parse
                  </MDButton>
                </MDBox>
                {parseNote && (
                  <MDTypography
                    variant="caption"
                    color={parseNote.type === "error" ? "error" : "success"}
                    display="block"
                    mb={2}
                  >
                    {parseNote.text}
                  </MDTypography>
                )}

                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <MDInput
                      label="Alert id (unique)"
                      value={form.id}
                      onChange={(e) => setForm({ ...form, id: e.target.value })}
                      fullWidth
                      required
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <MDInput
                      label="Company name"
                      value={form.company}
                      onChange={(e) => setForm({ ...form, company: e.target.value })}
                      fullWidth
                      required
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <MDInput
                      label="Workday tenant"
                      value={form.workday_tenant}
                      onChange={(e) => setForm({ ...form, workday_tenant: e.target.value })}
                      fullWidth
                      required
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <MDInput
                      label="Workday host, e.g. wd1, wd3, wd5"
                      value={form.workday_host}
                      onChange={(e) => setForm({ ...form, workday_host: e.target.value })}
                      fullWidth
                      required
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <MDInput
                      label="Workday site (short segment, not a full URL)"
                      value={form.workday_site}
                      onChange={(e) => setForm({ ...form, workday_site: e.target.value })}
                      fullWidth
                      required
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <MDInput
                      label="Keywords, comma separated"
                      value={form.keywords_any}
                      onChange={(e) => setForm({ ...form, keywords_any: e.target.value })}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <MDInput
                      label="Exclude keywords, comma separated"
                      value={form.keywords_exclude}
                      onChange={(e) => setForm({ ...form, keywords_exclude: e.target.value })}
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <MDInput
                      label="Location contains (e.g. Ireland)"
                      value={form.location_filter}
                      onChange={(e) => setForm({ ...form, location_filter: e.target.value })}
                      fullWidth
                    />
                  </Grid>
                </Grid>

                <MDButton type="submit" variant="gradient" color="info" sx={{ mt: 3 }}>
                  <Icon sx={{ mr: 0.5 }}>add</Icon>
                  Add alert
                </MDButton>
              </MDBox>
            </Card>
          </Grid>
        </Grid>

        {status && (
          <MDTypography
            variant="button"
            color={status.type === "error" ? "error" : "success"}
            display="block"
            mt={2}
          >
            {status.text}
          </MDTypography>
        )}
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}
