// Cosmetic-only role lookup - purely for deciding what the UI shows.
// The Worker is the real authorization boundary; nothing here is trusted.
export function getCurrentRole(email, adminsData, bootstrapEmail) {
  if (!email) return null;
  if (email === bootstrapEmail) return "admin";
  const entry = adminsData.admins.find((a) => a.email === email);
  return entry ? entry.role : null;
}
