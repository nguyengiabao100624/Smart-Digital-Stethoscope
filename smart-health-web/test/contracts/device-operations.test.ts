import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  parseDeviceCommandResponse,
  parsePortalDeviceListResponse,
} from "../../src/lib/device-operations.ts";

function device(overrides: Record<string, unknown> = {}) {
  return {
    id: "device-1",
    organizationId: "workspace-a",
    name: "Ống nghe A1",
    online: false,
    connected: true,
    battery: 82,
    firmwareVersion: "1.2.3",
    updatedAt: "2026-07-29T02:00:00.000Z",
    ...overrides,
  };
}

function command(overrides: Record<string, unknown> = {}) {
  return {
    protocolVersion: 1,
    id: "command-1",
    deviceId: "device-1",
    organizationId: "workspace-a",
    type: "restart",
    correlationId: "correlation-1",
    state: "delivered",
    status: "delivered",
    issuedAt: "2026-07-29T02:00:00.000Z",
    expiresAt: "2026-07-29T02:01:00.000Z",
    delivery: {
      websocket: true,
      mqtt: false,
      delivered: true,
    },
    ...overrides,
  };
}

test("portal device list keeps canonical online independent from legacy connected", () => {
    const result = parsePortalDeviceListResponse(
      {
        generatedAt: "2026-07-29T02:00:01.000Z",
        workspaceId: "workspace-a",
        devices: [device()],
      },
      "workspace-a",
    );

    assert.deepEqual(
      {
        id: result.devices[0].id,
        organizationId: result.devices[0].organizationId,
        online: result.devices[0].online,
        connected: result.devices[0].connected,
      },
      {
      id: "device-1",
      organizationId: "workspace-a",
      online: false,
      connected: true,
      },
    );
});

test("portal device list fails closed for foreign, duplicate, and sensitive rows", () => {
    assert.throws(() => {
      parsePortalDeviceListResponse(
        {
          generatedAt: "2026-07-29T02:00:01.000Z",
          workspaceId: "workspace-b",
          devices: [device({ organizationId: "workspace-b" })],
        },
        "workspace-a",
      );
    }, /workspace/i);

    assert.throws(() => {
      parsePortalDeviceListResponse(
        {
          generatedAt: "2026-07-29T02:00:01.000Z",
          workspaceId: "workspace-a",
          devices: [device(), device()],
        },
        "workspace-a",
      );
    }, /trùng/i);

    assert.throws(() => {
      parsePortalDeviceListResponse(
        {
          generatedAt: "2026-07-29T02:00:01.000Z",
          workspaceId: "workspace-a",
          devices: [
            device({
              credentialRotation: {
                state: "pending",
                nextSecretHash: "must-never-reach-a-client",
              },
            }),
          ],
        },
        "workspace-a",
      );
    }, /nhạy cảm/i);
});

test("device command receipt is bound to workspace, device, and command type", () => {
    const result = parseDeviceCommandResponse(
      { command: command() },
      {
        workspaceId: "workspace-a",
        deviceId: "device-1",
        type: "restart",
      },
    );

    assert.equal(result.command.state, "delivered");

    assert.throws(() => {
      parseDeviceCommandResponse(
        {
          command: command({
            organizationId: "workspace-b",
          }),
        },
        {
          workspaceId: "workspace-a",
          deviceId: "device-1",
          type: "restart",
        },
      );
    }, /workspace/i);

    assert.throws(() => {
      parseDeviceCommandResponse(
        {
          command: command({
            deviceId: "device-2",
          }),
        },
        {
          workspaceId: "workspace-a",
          deviceId: "device-1",
          type: "restart",
        },
      );
    }, /thiết bị/i);
});

test("keeps Portal device handling state-only and reserves commands for Platform Admin", async () => {
  const [pageSource, apiSource, smokeSource] = await Promise.all([
    readFile(
      new URL("../../src/app/pages/portal/DevicesPage.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../../src/lib/smart-health-api.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../../scripts/portalMutationSmokeTest.mjs", import.meta.url),
      "utf8",
    ),
  ]);

  assert.doesNotMatch(pageSource, /sendDeviceCommand|getDeviceCommand|onClick=\{send\}/);
  assert.doesNotMatch(
    apiSource,
    /sendDeviceCommand|getDeviceCommand|listDeviceCommands/,
  );
  assert.match(pageSource, /Lệnh thiết bị và OTA được\s+quản trị trong Platform Admin/);
  assert.doesNotMatch(smokeSource, /deviceSecret|\/portal\/devices\/provision-qr/);
  assert.doesNotMatch(
    smokeSource,
    /`\/portal\/devices\/\$\{encodeURIComponent\([^)]*deviceId[^)]*\)\}`[\s\S]{0,160}method:\s*"DELETE"/,
  );
  assert.match(smokeSource, /dedicated factory-enrolled, pre-provisioned/);
});
