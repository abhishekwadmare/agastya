import PropTypes from "prop-types";
import Card from "@mui/material/Card";
import Icon from "@mui/material/Icon";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDButton from "components/MDButton";
import MDBadge from "components/MDBadge";

function timeAgo(isoString) {
  if (!isoString) return "unknown";
  const diffMs = Date.now() - new Date(isoString).getTime();
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function JobRow({ job, applied, onApply }) {
  return (
    <Card sx={{ mb: 1.5 }}>
      <MDBox display="flex" alignItems="center" gap={2} px={2} py={1.5}>
        <MDBox flex={1} minWidth={0}>
          <MDTypography variant="caption" color="text" textTransform="uppercase" fontWeight="medium">
            {job.company} &middot; {job.location} &middot; detected {timeAgo(job.first_seen)}
          </MDTypography>
          <MDTypography
            variant="h6"
            fontWeight="medium"
            sx={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
          >
            {job.title}
          </MDTypography>
        </MDBox>

        {applied && <MDBadge badgeContent="applied" color="success" size="sm" container />}

        <MDButton
          component="a"
          href={job.apply_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => onApply(job)}
          variant="gradient"
          color="info"
          size="small"
        >
          Apply&nbsp;
          <Icon fontSize="small">arrow_forward</Icon>
        </MDButton>
      </MDBox>
    </Card>
  );
}

JobRow.propTypes = {
  job: PropTypes.shape({
    id: PropTypes.string.isRequired,
    company: PropTypes.string,
    location: PropTypes.string,
    title: PropTypes.string,
    first_seen: PropTypes.string,
    apply_url: PropTypes.string,
  }).isRequired,
  applied: PropTypes.bool.isRequired,
  onApply: PropTypes.func.isRequired,
};
