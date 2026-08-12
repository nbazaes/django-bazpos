const SEEN_KEY = "bazpos_changelog_seen";

export const CHANGELOG = import.meta.env.CHANGELOG || [];
export const APP_VERSION = import.meta.env.APP_VERSION || "";

export function getSeenVersion() {
  return localStorage.getItem(SEEN_KEY) || "";
}

export function markChangelogSeen(version = APP_VERSION) {
  if (version) localStorage.setItem(SEEN_KEY, version);
}

export function compareVersions(a, b) {
  const pa = String(a || "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b || "").split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

export function getUnseenChangelog() {
  if (!CHANGELOG.length) return [];
  const seen = getSeenVersion();
  if (!seen) return [CHANGELOG[0]].filter(Boolean);
  return CHANGELOG.filter((entry) => entry.version && compareVersions(entry.version, seen) > 0);
}

export function getFullChangelog() {
  return CHANGELOG;
}
