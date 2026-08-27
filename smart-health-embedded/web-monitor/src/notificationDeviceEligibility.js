"use strict";

function readIdentifier(value, maxLength = 160) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

async function resolveEligibleNotificationDevices(input = {}) {
  const notification = input.notification || {};
  const userId = readIdentifier(notification.userId, 120);
  const workspaceId = readIdentifier(
    notification.workspaceId || notification.organizationId,
    120,
  );
  if (!userId || !workspaceId) return [];

  const canonicalUser = await input.loadCanonicalUser(userId);
  if (
    !canonicalUser ||
    !input.isUserActive(canonicalUser) ||
    !input.hasWorkspaceAccess(canonicalUser, workspaceId)
  ) {
    return [];
  }

  const devices = await input.listDevices(userId, workspaceId);
  const requestedDeviceIds = new Set(
    Array.isArray(input.deviceIds)
      ? input.deviceIds.map((id) => readIdentifier(id)).filter(Boolean)
      : [],
  );
  const eligible = [];
  for (const device of Array.isArray(devices) ? devices : []) {
    const deviceId = readIdentifier(device?.id);
    const authSessionId = readIdentifier(device?.authSessionId);
    if (
      !deviceId ||
      !authSessionId ||
      device.userId !== userId ||
      device.workspaceId !== workspaceId ||
      Number(device.notificationProtocolVersion || 0) < 2 ||
      device.enabled === false ||
      (requestedDeviceIds.size > 0 && !requestedDeviceIds.has(deviceId))
    ) {
      continue;
    }
    if (await input.isSessionActive(userId, authSessionId)) {
      eligible.push(device);
    }
  }
  return eligible;
}

module.exports = {
  resolveEligibleNotificationDevices,
};
