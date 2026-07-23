import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import Icon from "@mui/material/Icon";

import MDBox from "components/MDBox";
import MDButton from "components/MDButton";
import MDInput from "components/MDInput";

import { callWorker } from "lib/callWorker.js";
import { requireAdmin } from "lib/roles.js";

// Split out from the Jobs page so typing here only re-renders this small
// control, not the (potentially thousands-long) jobs list above it - that
// coupling was the cause of the input feeling laggy when it lived as
// state directly on the Jobs component.
export default function ScrapeFrequencyControl({
  idToken,
  email,
  canManage,
  currentValue,
  onSaved,
  onStatus,
}) {
  const [frequencyInput, setFrequencyInput] = useState(currentValue);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFrequencyInput(currentValue);
  }, [currentValue]);

  async function handleSave() {
    onStatus(null);
    if (!requireAdmin({ idToken, email, canManage, setStatus: onStatus })) return;
    setSaving(true);
    try {
      await callWorker("/api/update-settings", idToken, {
        scrape_frequency_hours: Number(frequencyInput),
      });
      onStatus({ type: "success", text: "Scrape frequency updated." });
      onSaved();
    } catch (err) {
      onStatus({ type: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <MDBox display="flex" alignItems="center" gap={1} flexWrap="wrap">
      <MDInput
        label="Auto-scrape every (h)"
        type="number"
        size="small"
        value={frequencyInput}
        onChange={(e) => setFrequencyInput(e.target.value)}
        inputProps={{ min: 1 }}
        sx={{ width: 160, opacity: canManage ? 1 : 0.6 }}
      />
      <MDButton
        variant="outlined"
        color="dark"
        size="small"
        onClick={handleSave}
        disabled={saving}
        sx={{ opacity: canManage ? 1 : 0.6 }}
      >
        <Icon sx={{ mr: 0.5 }}>save</Icon>
        {saving ? "Saving…" : "Save"}
      </MDButton>
    </MDBox>
  );
}

ScrapeFrequencyControl.propTypes = {
  idToken: PropTypes.string,
  email: PropTypes.string,
  canManage: PropTypes.bool.isRequired,
  currentValue: PropTypes.number.isRequired,
  onSaved: PropTypes.func.isRequired,
  onStatus: PropTypes.func.isRequired,
};

ScrapeFrequencyControl.defaultProps = {
  idToken: null,
  email: null,
};
