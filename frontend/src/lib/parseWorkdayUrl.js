// Parses a pasted Workday careers URL like:
//   https://redhat.wd5.myworkdayjobs.com/jobs/?q=software&a=...
//   https://mongodb.wd1.myworkdayjobs.com/careers
// into { tenant, host, site, searchQuery }. Returns null if it doesn't
// look like a Workday URL.
export function parseWorkdayUrl(rawUrl) {
  try {
    const url = new URL(rawUrl.trim());
    const hostMatch = url.hostname.match(/^([^.]+)\.([^.]+)\.myworkdayjobs\.com$/);
    if (!hostMatch) return null;

    const [, tenant, host] = hostMatch;
    const site = url.pathname.split("/").filter(Boolean)[0];
    if (!site) return null;

    const searchQuery = url.searchParams.get("q") || "";
    return { tenant, host, site, searchQuery };
  } catch {
    return null;
  }
}
