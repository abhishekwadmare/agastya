import { useState } from "react";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDButton from "components/MDButton";
import MDInput from "components/MDInput";
import MDBadge from "components/MDBadge";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";

import { useAuth } from "context/AuthContext.jsx";
import { useData } from "context/DataContext.jsx";
import { callWorker } from "lib/callWorker.js";
import { isAdmin, requireAdmin } from "lib/roles.js";
import { BOOTSTRAP_ADMIN_EMAIL } from "../../config.js";
import StatusSnackbar from "components/StatusSnackbar.jsx";

const emptyAlertForm = {
  company_ids: [],
  keywords_any: "",
  keywords_exclude: "",
  location_filter: "",
  frequency_hours: "1",
};

function timeAgo(isoString) {
  if (!isoString) return "never";
  const diffMs = Date.now() - new Date(isoString).getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function Alerts() {
  const { idToken, email, requireSignIn } = useAuth();
  const { alertsData, companiesData, adminsData, reload } = useData();
  const canManage = isAdmin(email, adminsData, BOOTSTRAP_ADMIN_EMAIL);
  const myAlert = alertsData.alerts.find((a) => a.owner === email);

  const [status, setStatus] = useState(null);
  const [form, setForm] = useState(emptyAlertForm);
  const [isEditing, setIsEditing] = useState(false);

  function companyName(id) {
    return companiesData.companies.find((c) => c.id === id)?.company || id;
  }

  function startEditing() {
    setForm({
      company_ids: myAlert.companies || [],
      keywords_any: (myAlert.keywords_any || []).join(", "),
      keywords_exclude: (myAlert.keywords_exclude || []).join(", "),
      location_filter: myAlert.location_filter || "",
      frequency_hours: String(myAlert.frequency_hours || 1),
    });
    setIsEditing(true);
  }

  async function handleSaveAlert(e) {
    e.preventDefault();
    setStatus(null);
    if (!requireSignIn(setStatus)) return;
    if (!form.company_ids.length) {
      setStatus({ type: "error", text: "Pick at least one company." });
      return;
    }
    try {
      await callWorker("/api/add-alert", idToken, {
        alert: {
          companies: form.company_ids,
          keywords_any: form.keywords_any.split(",").map((k) => k.trim()).filter(Boolean),
          keywords_exclude: form.keywords_exclude.split(",").map((k) => k.trim()).filter(Boolean),
          location_filter: form.location_filter.trim(),
          frequency_hours: Number(form.frequency_hours) || 1,
        },
      });
      setStatus({ type: "success", text: "Alert saved." });
      setIsEditing(false);
      reload();
    } catch (err) {
      setStatus({ type: "error", text: err.message });
    }
  }

  async function handleDeleteAlert() {
    setStatus(null);
    if (!requireSignIn(setStatus)) return;
    try {
      await callWorker("/api/delete-alert", idToken, {});
      setStatus({ type: "success", text: "Alert deleted." });
      reload();
    } catch (err) {
      setStatus({ type: "error", text: err.message });
    }
  }

  async function handleTogglePaused() {
    setStatus(null);
    if (!requireSignIn(setStatus)) return;
    try {
      await callWorker("/api/set-alert-paused", idToken, { paused: !myAlert.paused });
      setStatus({ type: "success", text: myAlert.paused ? "Alert resumed." : "Alert paused." });
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
    if (!requireAdmin({ idToken, email, canManage, setStatus })) return;
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

  const showForm = !myAlert || isEditing;

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={5}>
            <Card>
              <MDBox p={3}>
                {canManage ? (
                  <>
                    <MDTypography variant="h6" mb={0.5}>
                      All alerts (admin view)
                    </MDTypography>
                    {alertsData.alerts.length === 0 && (
                      <MDTypography variant="button" color="text">
                        No alerts yet.
                      </MDTypography>
                    )}
                    {alertsData.alerts.map((a) => (
                      <MDBox
                        key={a.owner}
                        display="flex"
                        justifyContent="space-between"
                        alignItems="center"
                        py={1}
                        borderBottom="1px solid"
                        borderColor="grey.200"
                      >
                        <MDBox>
                          <MDTypography variant="button" display="block">
                            {(a.companies || []).map((id) => companyName(id)).join(", ")}
                            {a.paused && " (paused)"}
                          </MDTypography>
                          <MDTypography variant="caption" color="text">
                            {a.owner || "unknown"} · every {a.frequency_hours || 1}h
                          </MDTypography>
                        </MDBox>
                        <MDButton
                          variant="outlined"
                          color="error"
                          size="small"
                          onClick={() =>
                            callWorker("/api/delete-alert", idToken, { owner: a.owner }).then(reload)
                          }
                        >
                          Delete
                        </MDButton>
                      </MDBox>
                    ))}
                  </>
                ) : (
                  <MDTypography variant="button" color="text">
                    {idToken
                      ? "Manage your alert on the right."
                      : "Sign in with Google (top-right) to set up an alert."}
                  </MDTypography>
                )}

                <MDBox mt={3}>
                  <MDButton
                    component="label"
                    variant="gradient"
                    color="dark"
                    fullWidth
                    sx={{ opacity: canManage ? 1 : 0.6 }}
                  >
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
              {showForm ? (
                <MDBox p={3} component="form" onSubmit={handleSaveAlert}>
                  <MDTypography variant="h6" mb={0.5}>
                    {myAlert ? "Edit your alert" : "Create an alert"}
                  </MDTypography>
                  {!idToken && (
                    <MDTypography variant="caption" color="text" display="block" mb={1.5}>
                      Anyone can fill this out, but saving it requires signing in with Google
                      (top-right).
                    </MDTypography>
                  )}

                  <Grid container spacing={2} mt={idToken ? 0 : 1}>
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth required>
                        <InputLabel id="alert-companies-label">Companies</InputLabel>
                        <Select
                          labelId="alert-companies-label"
                          label="Companies"
                          multiple
                          value={form.company_ids}
                          onChange={(e) => setForm({ ...form, company_ids: e.target.value })}
                          renderValue={(selected) => selected.map((id) => companyName(id)).join(", ")}
                        >
                          {companiesData.companies.map((c) => (
                            <MenuItem key={c.id} value={c.id}>
                              {c.company}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <MDInput
                        label="Notify me at most every N hours"
                        type="number"
                        inputProps={{ min: 1, step: 1 }}
                        value={form.frequency_hours}
                        onChange={(e) => setForm({ ...form, frequency_hours: e.target.value })}
                        fullWidth
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

                  <MDButton
                    type="submit"
                    variant="gradient"
                    color="info"
                    sx={{ mt: 3, opacity: idToken ? 1 : 0.6 }}
                  >
                    <Icon sx={{ mr: 0.5 }}>{myAlert ? "save" : "add"}</Icon>
                    {myAlert ? "Save alert" : "Add alert"}
                  </MDButton>
                  {myAlert && (
                    <MDButton
                      variant="text"
                      color="dark"
                      sx={{ mt: 3, ml: 1 }}
                      onClick={() => setIsEditing(false)}
                    >
                      Cancel
                    </MDButton>
                  )}
                </MDBox>
              ) : (
                <MDBox p={3}>
                  <MDBox display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                    <MDTypography variant="h6">Your alert</MDTypography>
                    <MDBadge
                      badgeContent={myAlert.paused ? "paused" : "active"}
                      color={myAlert.paused ? "secondary" : "success"}
                      size="sm"
                      container
                    />
                  </MDBox>
                  <MDTypography variant="button" display="block">
                    {(myAlert.companies || []).map((id) => companyName(id)).join(", ")}
                  </MDTypography>
                  <MDTypography variant="caption" color="text" display="block">
                    {(myAlert.keywords_any || []).length > 0 &&
                      `Keywords: ${myAlert.keywords_any.join(", ")}. `}
                    {(myAlert.keywords_exclude || []).length > 0 &&
                      `Excluding: ${myAlert.keywords_exclude.join(", ")}. `}
                    {myAlert.location_filter && `Location contains "${myAlert.location_filter}". `}
                    Notified at most every {myAlert.frequency_hours || 1}h · last notified{" "}
                    {timeAgo(myAlert.last_notified_at)}
                  </MDTypography>
                  <MDBox mt={2} display="flex" gap={1}>
                    <MDButton variant="outlined" color="dark" size="small" onClick={startEditing}>
                      <Icon sx={{ mr: 0.5 }}>edit</Icon>
                      Edit
                    </MDButton>
                    <MDButton
                      variant="outlined"
                      color="warning"
                      size="small"
                      onClick={handleTogglePaused}
                    >
                      <Icon sx={{ mr: 0.5 }}>{myAlert.paused ? "play_arrow" : "pause"}</Icon>
                      {myAlert.paused ? "Resume" : "Pause"}
                    </MDButton>
                    <MDButton
                      variant="outlined"
                      color="error"
                      size="small"
                      onClick={handleDeleteAlert}
                    >
                      <Icon sx={{ mr: 0.5 }}>delete</Icon>
                      Delete
                    </MDButton>
                  </MDBox>
                </MDBox>
              )}
            </Card>
          </Grid>
        </Grid>
      </MDBox>
      <StatusSnackbar status={status} onClose={() => setStatus(null)} />
      <Footer />
    </DashboardLayout>
  );
}
