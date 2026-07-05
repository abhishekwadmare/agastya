import PropTypes from "prop-types";
import MDSnackbar from "components/MDSnackbar";

// Shared success/error toast for admin actions (Jobs, Companies, Alerts) -
// takes the {type, text} status shape every one of those pages already
// keeps in local state, so switching to this is a drop-in replacement
// for the old inline status text.
export default function StatusSnackbar({ status, onClose }) {
  const isError = status?.type === "error";

  return (
    <MDSnackbar
      color={isError ? "error" : "success"}
      icon={isError ? "warning" : "check"}
      title={isError ? "Error" : "Success"}
      dateTime="Just now"
      content={status?.text || ""}
      open={Boolean(status)}
      onClose={onClose}
      close={onClose}
    />
  );
}

StatusSnackbar.propTypes = {
  status: PropTypes.shape({
    type: PropTypes.oneOf(["success", "error"]),
    text: PropTypes.string,
  }),
  onClose: PropTypes.func.isRequired,
};

StatusSnackbar.defaultProps = {
  status: null,
};
