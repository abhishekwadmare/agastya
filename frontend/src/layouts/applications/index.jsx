import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDButton from "components/MDButton";
import MDBadge from "components/MDBadge";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";
import DataTable from "examples/Tables/DataTable";

import { useAuth } from "context/AuthContext.jsx";
import { useData } from "context/DataContext.jsx";
import { isAdmin } from "lib/roles.js";
import { BOOTSTRAP_ADMIN_EMAIL } from "../../config.js";

export default function Applications() {
  const { idToken, email } = useAuth();
  const { applicationsData, adminsData, loading } = useData();
  const canManage = isAdmin(email, adminsData, BOOTSTRAP_ADMIN_EMAIL);

  const columns = [
    { Header: "title", accessor: "title", width: "35%", align: "left" },
    { Header: "company", accessor: "company", align: "left" },
    { Header: "applied", accessor: "applied", align: "center" },
    { Header: "status", accessor: "status", align: "center" },
    { Header: "apply", accessor: "apply", align: "center" },
  ];

  const rows = applicationsData.applications.map((app) => ({
    title: (
      <MDTypography variant="button" fontWeight="medium">
        {app.title}
      </MDTypography>
    ),
    company: (
      <MDTypography variant="caption" color="text" fontWeight="medium">
        {app.company}
      </MDTypography>
    ),
    applied: (
      <MDTypography variant="caption" color="text">
        {app.applied_at ? new Date(app.applied_at).toLocaleDateString() : "—"}
      </MDTypography>
    ),
    status: <MDBadge badgeContent={app.status || "applied"} color="info" size="sm" container />,
    apply: (
      <MDButton
        component="a"
        href={app.apply_url}
        target="_blank"
        rel="noopener noreferrer"
        variant="text"
        color="info"
        size="small"
      >
        View
      </MDButton>
    ),
  }));

  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Card>
              <MDBox p={3}>
                <MDTypography variant="h6">Applications</MDTypography>
                <MDTypography variant="button" color="text">
                  {!idToken
                    ? "Sign in with Google (top-right) to see the jobs you've marked applied."
                    : canManage
                    ? `Showing every signed-in user's marked applications (admin view), ${applicationsData.applications.length} total.`
                    : `Jobs you've marked as applied, ${applicationsData.applications.length} total.`}
                </MDTypography>
              </MDBox>
              {!loading && (
                <DataTable table={{ columns, rows }} isSorted canSearch showTotalEntries />
              )}
            </Card>
          </Grid>
        </Grid>
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}
