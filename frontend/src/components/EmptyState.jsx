import PropTypes from "prop-types";
import Icon from "@mui/material/Icon";

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";

export default function EmptyState({ icon, message }) {
  return (
    <MDBox border="1px dashed" borderColor="grey.400" borderRadius="lg" p={4} textAlign="center">
      {icon && (
        <Icon fontSize="large" color="secondary" sx={{ mb: 1 }}>
          {icon}
        </Icon>
      )}
      <MDTypography variant="button" color="text" display="block">
        {message}
      </MDTypography>
    </MDBox>
  );
}

EmptyState.defaultProps = {
  icon: null,
};

EmptyState.propTypes = {
  icon: PropTypes.string,
  message: PropTypes.node.isRequired,
};
