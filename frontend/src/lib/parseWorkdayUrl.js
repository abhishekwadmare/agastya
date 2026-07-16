// Parses a pasted Workday URL into { tenant, host, site, searchQuery }.
// Returns null if it doesn't look like a Workday URL.
//
// Two input shapes are supported:
//   - The CXS API request URL, e.g.
//     https://cisco.wd5.myworkdayjobs.com/wday/cxs/cisco/Cisco_Careers/jobs
//     (visible in DevTools -> Network, filter "cxs") - {site} sits at a
//     fixed position here, so this is parsed unambiguously.
//   - The plain careers page URL, e.g.
//     https://redhat.wd5.myworkdayjobs.com/jobs
//     https://cisco.wd5.myworkdayjobs.com/en-US/Cisco_Careers
//     Best-effort: some tenants prefix a locale segment (en-US, de-DE, ...)
//     before the real site slug, so locale-shaped segments are skipped.
const LOCALE_SEGMENT = /^[a-z]{2}-[A-Z]{2}$/;

export function parseWorkdayUrl(rawUrl) {
  try {
    const url = new URL(rawUrl.trim());
    const hostMatch = url.hostname.match(/^([^.]+)\.([^.]+)\.myworkdayjobs\.com$/);
    if (!hostMatch) return null;

    const [, tenant, host] = hostMatch;
    const segments = url.pathname.split("/").filter(Boolean);
    const searchQuery = url.searchParams.get("q") || "";

    const cxsIndex = segments.findIndex((s) => s.toLowerCase() === "cxs");
    if (cxsIndex !== -1 && segments[cxsIndex + 2]) {
      return { tenant, host, site: segments[cxsIndex + 2], searchQuery };
    }

    const site = segments.filter((s) => !LOCALE_SEGMENT.test(s))[0];
    if (!site) return null;

    return { tenant, host, site, searchQuery };
  } catch {
    return null;
  }
}
