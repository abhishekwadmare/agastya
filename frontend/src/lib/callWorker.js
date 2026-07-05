import { WORKER_BASE_URL } from "../config.js";

export async function callWorker(path, idToken, extraPayload) {
  const resp = await fetch(`${WORKER_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken, ...extraPayload }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}
