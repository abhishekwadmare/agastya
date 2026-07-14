// These are PUBLIC values by design - a Google OAuth client id, a Worker
// URL, and the bootstrap admin's email are meant to be visible in
// frontend code. The actual security boundary is enforced server-side in
// the Worker, which resolves the verified Google token's email to a role
// (admin or user, see frontend/public/data/admins.json) before writing
// anything.
export const GOOGLE_CLIENT_ID = "841466924804-a9qu4pn9i35dbk5qlji3klcu2omu02s4.apps.googleusercontent.com";
export const WORKER_BASE_URL = "https://agastya-admin.abhishekwadmare.workers.dev";
export const BOOTSTRAP_ADMIN_EMAIL = "abhishek.wadmare@gmail.com";