export const DEMO_SESSION_COOKIE = "finansial_demo";
export const SESSION_ACTIVITY_COOKIE = "finansial_last_activity";
export const SESSION_ACTIVITY_STORAGE_KEY = "finansial-last-activity";
export const SESSION_IDLE_TIMEOUT_SECONDS = 4 * 60 * 60;
export const SESSION_IDLE_TIMEOUT_MS = SESSION_IDLE_TIMEOUT_SECONDS * 1000;
export const SESSION_ACTIVITY_THROTTLE_MS = 60_000;

export function parseSessionActivity(value?: string | null) {
  if (!value) return null;
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

export function isSessionExpired(lastActivity: number | null, now = Date.now()) {
  return !lastActivity || now - lastActivity > SESSION_IDLE_TIMEOUT_MS;
}
