const { decryptJson, encryptJson } = require("./cryptoPhi");

function canonicalPhiContext(workspaceId, recordType, recordId) {
  const workspace = String(workspaceId || "unscoped").trim() || "unscoped";
  const type = String(recordType || "record").trim() || "record";
  const id = String(recordId || "unknown").trim() || "unknown";
  return `${workspace}:${type}:${id}`;
}

function protectPhiRecord(recordType, recordId, workspaceId, value, env = process.env) {
  return encryptJson(
    value,
    env,
    canonicalPhiContext(workspaceId, recordType, recordId),
  );
}

function unprotectPhiRecord(recordType, recordId, workspaceId, envelope, env = process.env) {
  if (!envelope || typeof envelope !== "object" || envelope.encrypted !== true) return null;
  return decryptJson(
    envelope,
    env,
    canonicalPhiContext(workspaceId, recordType, recordId),
  );
}

module.exports = {
  canonicalPhiContext,
  protectPhiRecord,
  unprotectPhiRecord,
};
