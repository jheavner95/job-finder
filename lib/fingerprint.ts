export type FingerprintInput = {
  company: string;
  title: string;
  location?: string | null;
  sourceJobId?: string | null;
};

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(incorporated|inc|llc|ltd|corporation|corp)\b/g, "")
    .replace(/\b(sr|senior|jr|junior)\.?\b/g, (match) =>
      match.startsWith("s") ? "senior" : "junior",
    )
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "-");
}

function normalizeLocation(value: string | null | undefined) {
  const normalized = normalize(value);
  const hasRemote = normalized.includes("remote");
  const hasUnitedStates =
    normalized.includes("united-states") ||
    /(^|-)us(a)?(-|$)/.test(normalized);
  if (hasRemote && hasUnitedStates) return "remote-us";
  if (hasRemote && !normalized.replace("remote", "").replaceAll("-", "")) return "remote";
  return normalized;
}

function fnv1a(value: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createJobFingerprint(input: FingerprintInput) {
  const stableParts = [
    normalize(input.company),
    normalize(input.title),
    normalizeLocation(input.location),
    normalize(input.sourceJobId),
  ].join("|");
  return `job_${fnv1a(stableParts)}`;
}
