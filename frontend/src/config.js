// These are PUBLIC values by design - a Google OAuth client id and a
// Worker URL are meant to be visible in frontend code. The actual
// security boundary is enforced server-side in the Worker, which checks
// the verified Google token's email against ALLOWED_EMAIL before writing
// anything.
export const GOOGLE_CLIENT_ID = "841466924804-a9qu4pn9i35dbk5qlji3klcu2omu02s4.apps.googleusercontent.com";
export const WORKER_BASE_URL = "https://agastya-admin.<your-subdomain>.workers.dev";
