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
  loading,
  onSaved,
  onStatus,
}) {
  const [frequencyInput, setFrequencyInput] = useState(currentValue);
  const [saving, setSaving] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    // DataContext seeds currentValue with a client-side placeholder
    // (4) until GET /api/settings actually resolves - syncing from it
    // while still loading would show that placeholder first, then
    // visibly jump to the real stored value a moment later. `loading`
    // only ever flips false once (never resets on later reloads), so
    // this just smooths the first page load.
    if (loading) return;
    setFrequencyInput(currentValue);
    setHasLoaded(true);
  }, [loading, currentValue]);

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
        value={hasLoaded ? frequencyInput : ""}
        placeholder={hasLoaded ? undefined : "Loading…"}
        onChange={(e) => setFrequencyInput(e.target.value)}
        inputProps={{ min: 1 }}
        disabled={!hasLoaded}
        sx={{ width: 160, opacity: canManage ? 1 : 0.6 }}
      />
      <MDButton
        variant="outlined"
        color="dark"
        size="small"
        onClick={handleSave}
        disabled={saving || !hasLoaded}
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
  loading: PropTypes.bool.isRequired,
  onSaved: PropTypes.func.isRequired,
  onStatus: PropTypes.func.isRequired,
};

ScrapeFrequencyControl.defaultProps = {
  idToken: null,
  email: null,
};
