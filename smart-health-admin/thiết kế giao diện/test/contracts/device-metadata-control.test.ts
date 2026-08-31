import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const apiPath = new URL("../../src/lib/smart-health-api.ts", import.meta.url);
const devicesPath = new URL("../../src/components/admin/Devices.tsx", import.meta.url);
const dialogPath = new URL(
  "../../src/components/admin/dialogs/EditDeviceDialog.tsx",
  import.meta.url,
);
const transferDialogPath = new URL(
  "../../src/components/admin/dialogs/TransferDeviceDialog.tsx",
  import.meta.url,
);
const assignmentDialogPath = new URL(
  "../../src/components/admin/dialogs/AssignDevicePatientDialog.tsx",
  import.meta.url,
);
const backendPath = new URL(
  "../../../../smart-health-embedded/web-monitor/server.js",
  import.meta.url,
);

test("Platform Admin can edit audited device inventory metadata without spoofing telemetry", async () => {
  const [api, devices, dialog, transferDialog, assignmentDialog, backend] = await Promise.all([
    readFile(apiPath, "utf8"),
    readFile(devicesPath, "utf8"),
    readFile(dialogPath, "utf8"),
    readFile(transferDialogPath, "utf8"),
    readFile(assignmentDialogPath, "utf8"),
    readFile(backendPath, "utf8"),
  ]);

  assert.match(api, /async patchDevice\([\s\S]*"Idempotency-Key": idempotencyKey/);
  assert.match(devices, /<EditDeviceDialog/);
  assert.match(devices, /Chỉnh sửa thông tin/);
  for (const field of ["name", "type", "manufacturer", "model", "serialNumber", "purchaseDate"]) {
    assert.match(dialog, new RegExp(`name=["']${field}["']`));
  }
  assert.match(backend, /DEVICE_UPDATE_FIELD_FORBIDDEN/);
  assert.match(backend, /DEVICE_PURCHASE_DATE_INVALID/);
  assert.match(backend, /device\.update/);
  assert.match(backend, /DEVICE_REPORTED_FIELD_FORBIDDEN/);
  assert.match(api, /async transferDevice\([\s\S]*\/transfer/);
  assert.match(devices, /<TransferDeviceDialog/);
  assert.match(devices, /Chuyển workspace/);
  assert.match(transferDialog, /smartHealthApi\.listClinics/);
  assert.match(transferDialog, /smartHealthApi\.transferDevice/);
  assert.match(transferDialog, /Thiết bị sẽ ngắt phiên cloud hiện tại/);
  assert.match(api, /async assignDevicePatient\(/);
  assert.match(devices, /<AssignDevicePatientDialog/);
  assert.match(devices, /Gán bệnh nhân/);
  assert.match(assignmentDialog, /smartHealthApi\.listPatients/);
  assert.match(assignmentDialog, /organizationId: device\.organizationId/);
  assert.match(assignmentDialog, /smartHealthApi\.assignDevicePatient/);
  assert.match(backend, /PATIENT_LIST_WORKSPACE_SCOPE_DENIED/);
  for (const mutationDialog of [dialog, transferDialog, assignmentDialog]) {
    assert.match(mutationDialog, /attemptRef/);
    assert.match(mutationDialog, /attemptRef\.current\?\.fingerprint !== fingerprint/);
    assert.match(mutationDialog, /attemptRef\.current\.key/);
  }
});
