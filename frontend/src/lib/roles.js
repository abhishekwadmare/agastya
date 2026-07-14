// Cosmetic-only role lookup - purely for deciding what the UI shows.
// The Worker is the real authorization boundary; nothing here is trusted.
export function isAdmin(email, adminsData, bootstrapEmail) {
  if (!email) return false;
  if (email === bootstrapEmail) return true;
  return adminsData.admins.some((a) => a.email === email);
}

// Shared guard for admin-only actions (Companies, "Fetch jobs now",
// Alerts "Sync jobs"). Distinguishes "not signed in" from "signed in but
// not an admin" so the message actually tells the user what to do next,
// rather than a single generic "sign in" prompt either way.
export function requireAdmin({ idToken, email, canManage, setStatus }) {
  if (!idToken) {
    setStatus({
      type: "error",
      text: "Sign in with Google (top-right) to make changes.",
    });
    window.google?.accounts?.id?.prompt();
    return false;
  }
  if (!canManage) {
    setStatus({
      type: "error",
      text: `You're signed in as ${email}, but this needs admin access.`,
    });
    return false;
  }
  return true;
}
