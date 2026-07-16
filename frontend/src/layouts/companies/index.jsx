import { useState } from "react";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Tooltip from "@mui/material/Tooltip";

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
import { isAdmin, requireAdmin } from "lib/roles.js";
import { BOOTSTRAP_ADMIN_EMAIL } from "../../config.js";
import StatusSnackbar from "components/StatusSnackbar.jsx";

// Workday is the only ATS this app knows how to poll today (see
// scraper/core.py). Kept as a list, not a hardcoded value, so a second ATS
// (Greenhouse, Lever, ...) is a new entry + a new branch below, not a
// redesign.
const ATS_OPTIONS = [{ value: "workday", label: "Workday" }];

const PASTE_MODES = {
  careers: {
    label: "Careers page URL",
    placeholder: "https://cisco.wd5.myworkdayjobs.com/en-US/Cisco_Careers",
    hint: "The public careers page URL. Works for most tenants, but some include a locale segment (e.g. en-US) before the real site slug - double-check the fields below after parsing.",
  },
  cxs: {
    label: "Network request URL",
    placeholder: "https://cisco.wd5.myworkdayjobs.com/wday/cxs/cisco/Cisco_Careers/jobs",
    hint: 'From DevTools → Network tab, filter by "cxs", copy the request URL. Most reliable - parses exactly, no guessing.',
  },
};

const emptyCompanyForm = {
  company: "",
  ats_type: "workday",
  workday_tenant: "",
  workday_host: "wd1",
  workday_site: "",
};

function sameWorkdayValues(a, b) {
  if (!a || !b) return false;
  return (
    a.workday_tenant === b.workday_tenant &&
    a.workday_host === b.workday_host &&
    a.workday_site === b.workday_site
  );
}

export default function Companies() {
  const { idToken, email } = useAuth();
  const { companiesData, adminsData, reload } = useData();
  const canManage = isAdmin(email, adminsData, BOOTSTRAP_ADMIN_EMAIL);

  const [status, setStatus] = useState(null);
  const [form, setForm] = useState(emptyCompanyForm);
  const [pasteMode, setPasteMode] = useState("careers");
  const [pasteUrl, setPasteUrl] = useState("");
  const [parseNote, setParseNote] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testedValues, setTestedValues] = useState(null);

  function updateWorkdayField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    setTestResult(null);
  }

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
    }));
    setTestResult(null);
    setParseNote({
      type: "success",
      text: `Parsed: tenant=${parsed.tenant}, host=${parsed.host}, site=${parsed.site}. Test the connection below before adding.`,
    });
  }

  async function handleTestConnection() {
    setStatus(null);
    if (!requireAdmin({ idToken, email, canManage, setStatus })) return;
    const candidate = {
      workday_tenant: form.workday_tenant.trim(),
      workday_host: form.workday_host.trim() || "wd1",
      workday_site: form.workday_site.trim(),
    };
    if (!candidate.workday_tenant || !candidate.workday_site) {
      setStatus({ type: "error", text: "Fill in tenant and site before testing." });
      return;
    }
    setTesting(true);
    try {
      const result = await callWorker("/api/test-company", idToken, candidate);
      setTestResult(result);
      setTestedValues(candidate);
      setStatus(
        result.ok
          ? { type: "success", text: `✓ ${result.total} job(s) found.` }
          : { type: "error", text: `✗ ${result.message}` }
      );
    } catch (err) {
      setTestResult({ ok: false, message: err.message });
      setTestedValues(candidate);
      setStatus({ type: "error", text: err.message });
    } finally {
      setTesting(false);
    }
  }

  const currentWorkdayValues = {
    workday_tenant: form.workday_tenant.trim(),
    workday_host: form.workday_host.trim() || "wd1",
    workday_site: form.workday_site.trim(),
  };
  const canAdd =
    form.ats_type !== "workday" ||
    (testResult?.ok && sameWorkdayValues(testedValues, currentWorkdayValues));

  async function handleAddCompany(e) {
    e.preventDefault();
    setStatus(null);
    if (!requireAdmin({ idToken, email, canManage, setStatus })) return;
    if (!canAdd) {
      setStatus({ type: "error", text: "Test the connection first." });
      return;
    }
    try {
      const { company } = await callWorker("/api/add-company", idToken, {
        company: {
          company: form.company.trim(),
          ats_type: form.ats_type,
          workday_tenant: form.workday_tenant.trim(),
          workday_host: form.workday_host.trim() || "wd1",
          workday_site: form.workday_site.trim(),
        },
      });
      setStatus({ type: "success", text: `Added '${company.company}'.` });
      setForm(emptyCompanyForm);
      setPasteUrl("");
      setParseNote(null);
      setTestResult(null);
      setTestedValues(null);
      reload();
    } catch (err) {
      setStatus({ type: "error", text: err.message });
    }
  }

  async function handleDeleteCompany(id) {
    setStatus(null);
    if (!requireAdmin({ idToken, email, canManage, setStatus })) return;
    try {
      await callWorker("/api/delete-company", idToken, { id });
      setStatus({ type: "success", text: `Deleted '${id}'.` });
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
                  Companies watched
                </MDTypography>
                {companiesData.companies.length === 0 && (
                  <MDTypography variant="button" color="text">
                    No companies yet — add one on the right.
                  </MDTypography>
                )}
                {companiesData.companies.map((c) => (
                  <MDBox
                    key={c.id}
                    display="flex"
                    justifyContent="space-between"
                    alignItems="center"
                    py={1}
                    borderBottom="1px solid"
                    borderColor="grey.200"
                  >
                    <MDTypography variant="button">
                      {c.company} — {c.workday_tenant}.{c.workday_host}/{c.workday_site}
                    </MDTypography>
                    <MDButton
                      variant="outlined"
                      color="error"
                      size="small"
                      onClick={() => handleDeleteCompany(c.id)}
                      sx={{ opacity: canManage ? 1 : 0.6 }}
                    >
                      Delete
                    </MDButton>
                  </MDBox>
                ))}
              </MDBox>
            </Card>
          </Grid>

          <Grid item xs={12} md={7}>
            <Card>
              <MDBox p={3} component="form" onSubmit={handleAddCompany}>
                <MDTypography variant="h6" mb={0.5}>
                  Add a company
                </MDTypography>
                {!canManage && (
                  <MDTypography variant="caption" color="text" display="block" mb={1.5}>
                    Anyone can fill this out, but adding it requires signing in with Google
                    (top-right) as an admin. All of this company&apos;s postings will show up on
                    the Jobs page, unfiltered.
                  </MDTypography>
                )}

                <FormControl fullWidth sx={{ mt: canManage ? 2 : 0, mb: 2 }}>
                  <InputLabel id="ats-type-label">ATS</InputLabel>
                  <Select
                    labelId="ats-type-label"
                    label="ATS"
                    value={form.ats_type}
                    onChange={(e) => setForm((f) => ({ ...f, ats_type: e.target.value }))}
                  >
                    {ATS_OPTIONS.map((opt) => (
                      <MenuItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {form.ats_type === "workday" && (
                  <>
                    <MDBox display="flex" gap={1} mb={1}>
                      {Object.entries(PASTE_MODES).map(([mode, { label }]) => (
                        <MDButton
                          key={mode}
                          type="button"
                          size="small"
                          variant={pasteMode === mode ? "gradient" : "outlined"}
                          color="dark"
                          onClick={() => setPasteMode(mode)}
                        >
                          {label}
                        </MDButton>
                      ))}
                    </MDBox>
                    <MDTypography variant="caption" color="text" display="block" mb={1}>
                      {PASTE_MODES[pasteMode].hint}
                    </MDTypography>

                    <MDBox display="flex" gap={1} mb={1}>
                      <MDInput
                        label={PASTE_MODES[pasteMode].label}
                        placeholder={PASTE_MODES[pasteMode].placeholder}
                        value={pasteUrl}
                        onChange={(e) => setPasteUrl(e.target.value)}
                        fullWidth
                      />
                      <MDButton
                        type="button"
                        variant="outlined"
                        color="dark"
                        onClick={handleParseUrl}
                      >
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
                          onChange={(e) => updateWorkdayField("workday_tenant", e.target.value)}
                          fullWidth
                          required
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <MDInput
                          label="Workday host, e.g. wd1, wd3, wd5"
                          value={form.workday_host}
                          onChange={(e) => updateWorkdayField("workday_host", e.target.value)}
                          fullWidth
                          required
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <MDInput
                          label="Workday site (short segment, not a full URL)"
                          value={form.workday_site}
                          onChange={(e) => updateWorkdayField("workday_site", e.target.value)}
                          fullWidth
                          required
                        />
                      </Grid>
                    </Grid>

                    <MDBox display="flex" alignItems="center" gap={2} mt={3}>
                      <MDButton
                        type="button"
                        variant="outlined"
                        color="info"
                        onClick={handleTestConnection}
                        disabled={testing}
                      >
                        {testing ? "Testing…" : "Test connection"}
                      </MDButton>
                      {testResult && sameWorkdayValues(testedValues, currentWorkdayValues) && (
                        <MDTypography
                          variant="caption"
                          color={testResult.ok ? "success" : "error"}
                        >
                          {testResult.ok
                            ? `✓ ${testResult.total} job(s) found`
                            : `✗ ${testResult.message}`}
                        </MDTypography>
                      )}
                    </MDBox>
                  </>
                )}

                <Tooltip title={canAdd ? "" : "Test the connection first"} disableHoverListener={canAdd}>
                  <span>
                    <MDButton
                      type="submit"
                      variant="gradient"
                      color="info"
                      disabled={!canAdd}
                      sx={{ mt: 2, opacity: canManage ? 1 : 0.6 }}
                    >
                      <Icon sx={{ mr: 0.5 }}>add</Icon>
                      Add company
                    </MDButton>
                  </span>
                </Tooltip>
              </MDBox>
            </Card>
          </Grid>
        </Grid>
      </MDBox>
      <StatusSnackbar status={status} onClose={() => setStatus(null)} />
      <Footer />
    </DashboardLayout>
  );
}
