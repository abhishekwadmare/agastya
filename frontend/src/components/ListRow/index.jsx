import PropTypes from "prop-types";
import Card from "@mui/material/Card";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDAvatar from "components/MDAvatar";

export default function ListRow({ avatarLabel, avatarColor, primary, secondary, action }) {
  return (
    <Card
      sx={{
        mb: 1,
        transition: "box-shadow 0.2s ease, transform 0.2s ease",
        "&:hover": {
          boxShadow: ({ boxShadows }) => boxShadows.md,
          transform: "translateY(-1px)",
        },
      }}
    >
      <MDBox display="flex" justifyContent="space-between" alignItems="center" gap={2} px={2} py={1.5}>
        <MDBox display="flex" alignItems="center" gap={1.5} minWidth={0} flex={1}>
          <MDAvatar bgColor={avatarColor} size="sm">
            {avatarLabel}
          </MDAvatar>
          <MDBox minWidth={0}>
            <MDTypography
              variant="button"
              fontWeight="medium"
              display="block"
              sx={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
            >
              {primary}
            </MDTypography>
            {secondary && (
              <MDTypography variant="caption" color="text">
                {secondary}
              </MDTypography>
            )}
          </MDBox>
        </MDBox>
        {action}
      </MDBox>
    </Card>
  );
}

ListRow.defaultProps = {
  avatarColor: "primary",
  secondary: null,
  action: null,
};

ListRow.propTypes = {
  avatarLabel: PropTypes.string.isRequired,
  avatarColor: PropTypes.string,
  primary: PropTypes.node.isRequired,
  secondary: PropTypes.node,
  action: PropTypes.node,
};
