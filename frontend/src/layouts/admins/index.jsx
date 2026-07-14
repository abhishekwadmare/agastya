import { useState } from "react";
import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import MenuItem from "@mui/material/MenuItem";

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
import { getCurrentRole } from "lib/roles.js";
import { BOOTSTRAP_ADMIN_EMAIL } from "../../config.js";
import StatusSnackbar from "components/StatusSnackbar.jsx";

const emptyAdminForm = { email: "", role: "user" };

export default function Admins() {
  const { idToken, email, requireSignIn } = useAuth();
  const { adminsData, reload } = useData();

  const [status, setStatus] = useState(null);
  const [form, setForm] = useState(emptyAdminForm);

  const currentRole = getCurrentRole(email, adminsData, BOOTSTRAP_ADMIN_EMAIL);
  const canManage = currentRole === "admin";

  async function handleAddAdmin(e) {
    e.preventDefault();
    setStatus(null);
    if (!requireSignIn(setStatus)) return;
    try {
      const { admin } = await callWorker("/api/add-admin", idToken, {
        email: form.email.trim(),
        role: form.role,
      });
      setStatus({ type: "success", text: `Added ${admin.role} '${admin.email}'.` });
      setForm(emptyAdminForm);
      reload();
    } catch (err) {
      setStatus({ type: "error", text: err.message });
    }
  }

  async function handleRemoveAdmin(target) {
    setStatus(null);
    if (!requireSignIn(setStatus)) return;
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
                  Admins &amp; users
                </MDTypography>

                <MDBox
                  display="flex"
                  justifyContent="space-between"
                  alignItems="center"
                  py={1}
                  borderBottom="1px solid"
                  borderColor="grey.200"
                >
                  <MDTypography variant="button">
                    {BOOTSTRAP_ADMIN_EMAIL} — admin (owner)
                  </MDTypography>
                </MDBox>

                {adminsData.admins.map((a) => (
                  <MDBox
                    key={a.email}
                    display="flex"
                    justifyContent="space-between"
                    alignItems="center"
                    py={1}
                    borderBottom="1px solid"
                    borderColor="grey.200"
                  >
                    <MDTypography variant="button">
                      {a.email} — {a.role}
                    </MDTypography>
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
                  </MDBox>
                ))}
              </MDBox>
            </Card>
          </Grid>

          <Grid item xs={12} md={7}>
            <Card>
              <MDBox p={3} component="form" onSubmit={handleAddAdmin}>
                <MDTypography variant="h6" mb={0.5}>
                  Add an admin or user
                </MDTypography>
                <MDTypography variant="caption" color="text" display="block" mb={1.5}>
                  Admins can manage companies, alerts, applications, and this admin list, and can
                  trigger a fetch. Users can only manage alerts and applications. This requires
                  signing in with Google (top-right) as an existing admin.
                </MDTypography>

                <Grid container spacing={2} mt={0.5}>
                  <Grid item xs={12} sm={8}>
                    <MDInput
                      label="Email"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      fullWidth
                      required
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <MDInput
                      select
                      label="Role"
                      value={form.role}
                      onChange={(e) => setForm({ ...form, role: e.target.value })}
                      fullWidth
                    >
                      <MenuItem value="user">user</MenuItem>
                      <MenuItem value="admin">admin</MenuItem>
                    </MDInput>
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
                      ? `Signed in as ${email} (role ${currentRole ?? "none"}) — admin management requires role admin.`
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
