import Grid from "@mui/material/Grid";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDButton from "components/MDButton";

import DashboardLayout from "examples/LayoutContainers/DashboardLayout";
import DashboardNavbar from "examples/Navbars/DashboardNavbar";
import Footer from "examples/Footer";

const STACK = [
  "React",
  "Vite",
  "MUI",
  "Python",
  "Cloudflare Workers",
  "GitHub Actions",
  "GitHub Pages",
];

export default function About() {
  return (
    <DashboardLayout>
      <DashboardNavbar />
      <MDBox py={3}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={7}>
            <Card>
              <MDBox p={3}>
                <MDTypography variant="h5" mb={1}>
                  About Agastya
                </MDTypography>
                <MDTypography variant="button" color="text" display="block" mb={2}>
                  Named after the Vedic sage tied to the star Canopus, historically used for
                  navigation when nothing else was visible.
                </MDTypography>
                <MDTypography variant="body2" color="text" mb={2}>
                  Agastya is a self-hosted job alert system. It watches Workday-hosted company
                  career pages directly via their public JSON API — rather than waiting on
                  LinkedIn or Indeed syndication — and surfaces every posting from each watched
                  company here as soon as it's found. A companion script can also run
                  continuously on a local machine for faster, desktop/Telegram-notified alerts
                  between scheduled scans.
                </MDTypography>
                <MDTypography variant="body2" color="text" mb={2}>
                  Which companies get watched is managed through the Companies page, gated by
                  Google Sign-In — but the frontend never decides who's authorized on its own.
                  Every write goes through a Cloudflare Worker that verifies the sign-in
                  server-side before touching anything, which is the actual security boundary
                  here.
                </MDTypography>

                <MDTypography variant="button" fontWeight="medium" display="block" mb={1}>
                  Built with
                </MDTypography>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mb={2}>
                  {STACK.map((tech) => (
                    <Chip key={tech} label={tech} size="small" sx={{ mb: 1 }} />
                  ))}
                </Stack>

                <MDButton
                  component="a"
                  href="https://github.com/abhishekwadmare/agastya"
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="gradient"
                  color="dark"
                >
                  <Icon sx={{ mr: 0.5 }}>code</Icon>
                  View source on GitHub
                </MDButton>
              </MDBox>
            </Card>
          </Grid>

          <Grid item xs={12} md={5}>
            <Card>
              <MDBox p={3}>
                <MDTypography variant="h6" mb={1}>
                  Built by Abhishek Wadmare
                </MDTypography>
                <MDTypography variant="body2" color="text" mb={2}>
                  This is also a portfolio piece — code quality and being able to explain the
                  architecture matter as much as the tool working day to day.
                </MDTypography>
                <MDButton
                  component="a"
                  href="https://github.com/abhishekwadmare"
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="outlined"
                  color="dark"
                  fullWidth
                >
                  <Icon sx={{ mr: 0.5 }}>person</Icon>
                  GitHub profile
                </MDButton>
              </MDBox>
            </Card>
          </Grid>
        </Grid>
      </MDBox>
      <Footer />
    </DashboardLayout>
  );
}
