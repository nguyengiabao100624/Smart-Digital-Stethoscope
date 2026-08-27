const FIRST_PARTY_CORS_ORIGINS = Object.freeze([
  "https://shcare.web.app",
  "https://shcare-admin.web.app",
  "https://shcare--rc2-web-6c6d79f6-fz0by6g2.web.app",
  "https://shcare-admin--rc2-admin-9a4855a4-8mb2r6z9.web.app",
]);

function normalizeOrigin(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw === "*") return raw;
  try {
    const parsed = new URL(raw);
    if (!/^https?:$/.test(parsed.protocol)) return "";
    if (parsed.username || parsed.password) return "";
    return parsed.origin;
  } catch {
    return "";
  }
}

function getConfiguredCorsOrigins(env = process.env) {
  const raw = String(env.CORS_ORIGIN || "*").trim().slice(0, 2000);
  if (raw === "*") return ["*"];
  const configured = raw
    .split(",")
    .map(normalizeOrigin)
    .filter((origin) => origin && origin !== "*");
  return [...new Set([...configured, ...FIRST_PARTY_CORS_ORIGINS])];
}

function resolveCorsOrigin(headers = {}, env = process.env) {
  const configured = getConfiguredCorsOrigins(env);
  if (configured.includes("*")) return "*";
  const requested = normalizeOrigin(headers.origin);
  return requested && configured.includes(requested) ? requested : null;
}

module.exports = {
  FIRST_PARTY_CORS_ORIGINS,
  getConfiguredCorsOrigins,
  normalizeOrigin,
  resolveCorsOrigin,
};
