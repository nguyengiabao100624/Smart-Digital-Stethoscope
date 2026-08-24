const RELEASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const COMMIT_PATTERN = /^[a-fA-F0-9]{7,64}$/;

function normalizeReleaseId(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  return RELEASE_ID_PATTERN.test(raw) ? raw : "";
}

function normalizeCommit(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  return COMMIT_PATTERN.test(raw) ? raw.toLowerCase().slice(0, 12) : "";
}

function buildReleaseIdentity(env = process.env) {
  const commit = normalizeCommit(
    env.RENDER_GIT_COMMIT || env.GIT_COMMIT || env.SOURCE_VERSION,
  );
  const explicitId = normalizeReleaseId(env.SMART_HEALTH_RELEASE_ID);
  return {
    id: explicitId || (commit ? `git-${commit}` : "development"),
    commit,
  };
}

module.exports = {
  buildReleaseIdentity,
  normalizeCommit,
  normalizeReleaseId,
};
