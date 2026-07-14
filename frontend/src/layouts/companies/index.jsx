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
import { isAdmin, requireAdmin } from "lib/roles.js";
import { BOOTSTRAP_ADMIN_EMAIL } from "../../config.js";
import StatusSnackbar from "components/StatusSnackbar.jsx";

const emptyCompanyForm = {
  company: "",
  workday_tenant: "",
  workday_host: "wd1",
  workday_site: "",
};

export default function Companies() {
  const { idToken, email } = useAuth();
  const { companiesData, adminsData, reload } = useData();
  const canManage = isAdmin(email, adminsData, BOOTSTRAP_ADMIN_EMAIL);

  const [status, setStatus] = useState(null);
  const [form, setForm] = useState(emptyCompanyForm);
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
    }));
    setParseNote({
      type: "success",
      text: `Parsed: tenant=${parsed.tenant}, host=${parsed.host}, site=${parsed.site}. Double-check below.`,
    });
  }

  async function handleAddCompany(e) {
    e.preventDefault();
    setStatus(null);
    if (!requireAdmin({ idToken, email, canManage, setStatus })) return;
    try {
      const { company } = await callWorker("/api/add-company", idToken, {
        company: {
          company: form.company.trim(),
          workday_tenant: form.workday_tenant.trim(),
          workday_host: form.workday_host.trim() || "wd1",
          workday_site: form.workday_site.trim(),
        },
      });
      setStatus({ type: "success", text: `Added '${company.company}'.` });
      setForm(emptyCompanyForm);
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

                <MDBox display="flex" gap={1} mb={1} mt={canManage ? 2 : 0}>
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
                </Grid>

                <MDButton
                  type="submit"
                  variant="gradient"
                  color="info"
                  sx={{ mt: 3, opacity: canManage ? 1 : 0.6 }}
                >
                  <Icon sx={{ mr: 0.5 }}>add</Icon>
                  Add company
                </MDButton>
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
