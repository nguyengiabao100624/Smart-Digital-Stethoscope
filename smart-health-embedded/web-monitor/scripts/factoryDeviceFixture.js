const { canonicalDeviceSecretHash } = require("../src/deviceSessionSecurity");

function createFactoryEnrolledDeviceFixture({
  deviceId,
  organizationId = "",
  factoryCredential,
  name = "",
  type = "stethoscope",
  createdAt = new Date().toISOString(),
} = {}) {
  const id = String(deviceId || "").trim();
  const credential = String(factoryCredential || "");
  if (!id) throw new TypeError("A factory fixture deviceId is required");
  if (!credential) throw new TypeError("A factory fixture credential is required");
  return {
    id,
    organizationId: String(organizationId || ""),
    name: String(name || id),
    type: String(type || "stethoscope"),
    status: "unclaimed",
    ownershipState: "provisioned",
    ownerUserId: "",
    pairedUserId: "",
    assignedPatientId: "",
    connected: false,
    secretHash: canonicalDeviceSecretHash(credential),
    createdAt,
    updatedAt: createdAt,
  };
}

module.exports = { createFactoryEnrolledDeviceFixture };
