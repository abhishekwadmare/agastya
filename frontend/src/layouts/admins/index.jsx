import { useState } from "react";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDButton from "components/MDButton";
import MDInput from "components/MDInput";
import ListRow from "components/ListRow";
import ListRowSkeleton from "components/ListRowSkeleton.jsx";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";

import { useAuth } from "context/AuthContext.jsx";
import { useData } from "context/DataContext.jsx";
import { callWorker } from "lib/callWorker.js";
import { isAdmin, requireAdmin } from "lib/roles.js";
import { BOOTSTRAP_ADMIN_EMAIL } from "../../config.js";
import StatusSnackbar from "components/StatusSnackbar.jsx";

const emptyAdminForm = { email: "" };

export default function Admins() {
  const { idToken, email } = useAuth();
  const { adminsData, reload, loading } = useData();

  const [status, setStatus] = useState(null);
  const [form, setForm] = useState(emptyAdminForm);

  const canManage = isAdmin(email, adminsData, BOOTSTRAP_ADMIN_EMAIL);

  async function handleAddAdmin(e) {
    e.preventDefault();
    setStatus(null);
    if (!requireAdmin({ idToken, email, canManage, setStatus })) return;
    try {
      const { admin } = await callWorker("/api/add-admin", idToken, {
        email: form.email.trim(),
      });
      setStatus({ type: "success", text: `Added '${admin.email}' as an admin.` });
      setForm(emptyAdminForm);
      reload();
    } catch (err) {
      setStatus({ type: "error", text: err.message });
    }
  }

  async function handleRemoveAdmin(target) {
    setStatus(null);
    if (!requireAdmin({ idToken, email, canManage, setStatus })) return;
    try {
      await callWorker("/api/remove-admin", idToken, { email: target });
      setStatus({ type: "success", text: `Removed '${target}'.` });
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
                  Admins
                </MDTypography>

                <ListRow
                  avatarLabel={BOOTSTRAP_ADMIN_EMAIL[0].toUpperCase()}
                  avatarColor="dark"
                  primary={`${BOOTSTRAP_ADMIN_EMAIL} (owner)`}
                />

                {loading && <ListRowSkeleton count={2} />}
                {adminsData.admins.map((a) => (
                  <ListRow
                    key={a.email}
                    avatarLabel={a.email[0].toUpperCase()}
                    primary={a.email}
                    action={
                      <MDButton
                        variant="outlined"
                        color="error"
                        size="small"
                        onClick={() => handleRemoveAdmin(a.email)}
                        sx={{ opacity: canManage ? 1 : 0.6 }}
                        disabled={!canManage}
                      >
                        Remove
                      </MDButton>
                    }
                  />
                ))}
              </MDBox>
            </Card>
          </Grid>

          <Grid item xs={12} md={7}>
            <Card>
              <MDBox p={3} component="form" onSubmit={handleAddAdmin}>
                <MDTypography variant="h6" mb={0.5}>
                  Add an admin
                </MDTypography>
                <MDTypography variant="caption" color="text" display="block" mb={1.5}>
                  Admins have full access — companies, alerts, applications, fetch jobs, and
                  managing this list. Anyone who signs in with Google can already add their own
                  alerts and mark jobs applied without being added here — add someone here only to
                  grant them admin access.
                </MDTypography>

                <Grid container spacing={2} mt={0.5}>
                  <Grid item xs={12}>
                    <MDInput
                      label="Email"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
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
                  disabled={!canManage}
                >
                  <Icon sx={{ mr: 0.5 }}>add</Icon>
                  Add
                </MDButton>
                {!canManage && (
                  <MDTypography variant="caption" color="text" display="block" mt={1}>
                    {idToken
                      ? `Signed in as ${email} — admin management requires admin access.`
                      : "Sign in as an admin to manage this list."}
                  </MDTypography>
                )}
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
