import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const devicesPath = new URL("../../src/components/admin/Devices.tsx", import.meta.url);
const activatePath = new URL(
  "../../src/components/admin/dialogs/ActivateDeviceDialog.tsx",
  import.meta.url,
);
const addDevicePath = new URL(
  "../../src/components/admin/dialogs/AddDeviceDialog.tsx",
  import.meta.url,
);
const rotateDeviceSecretPath = new URL(
  "../../src/components/admin/dialogs/RotateDeviceSecretDialog.tsx",
  import.meta.url,
);
const apiPath = new URL("../../src/lib/smart-health-api.ts", import.meta.url);
const adminMutationSmokePath = new URL("../../scripts/adminMutationSmokeTest.mjs", import.meta.url);

test("keeps device history by removing hard-delete API and UI actions", async () => {
  const [devicesSource, apiSource, smokeSource] = await Promise.all([
    readFile(devicesPath, "utf8"),
    readFile(apiPath, "utf8"),
    readFile(adminMutationSmokePath, "utf8"),
  ]);

  assert.doesNotMatch(devicesSource, /kind:\s*["']delete["']/);
  assert.doesNotMatch(devicesSource, /smartHealthApi\.deleteDevice/);
  assert.doesNotMatch(apiSource, /async\s+deleteDevice\s*\(/);
  assert.doesNotMatch(
    smokeSource,
    /`\/devices\/\$\{encodeURIComponent\(state\.deviceId\)\}`,[\s\S]{0,100}method:\s*["']DELETE["']/,
  );
  assert.match(smokeSource, /`\/devices\/\$\{encodeURIComponent\(state\.deviceId\)\}\/revoke`/);
});

test("does not expose the unsupported device unpair dead control", async () => {
  const [devicesSource, apiSource] = await Promise.all([
    readFile(devicesPath, "utf8"),
    readFile(apiPath, "utf8"),
  ]);

  assert.doesNotMatch(devicesSource, /kind:\s*["']unpair["']/);
  assert.doesNotMatch(devicesSource, /smartHealthApi\.unpairDevice/);
  assert.doesNotMatch(devicesSource, /Hủy ghép đôi/);
  assert.doesNotMatch(apiSource, /async\s+unpairDevice\s*\(/);
  assert.match(devicesSource, /kind:\s*["']revoke["']/);
});

test("forwards stable idempotency keys for pair, revoke, command, and OTA mutations", async () => {
  const [apiSource, devicesSource] = await Promise.all([
    readFile(apiPath, "utf8"),
    readFile(devicesPath, "utf8"),
  ]);
  const idempotencyHeaderCount = apiSource.match(/["']Idempotency-Key["']/g)?.length ?? 0;

  assert.ok(idempotencyHeaderCount >= 4);
  assert.match(apiSource, /SmartHealthDevicePairingResponse/);
  assert.match(apiSource, /SmartHealthDeviceCommandResponse/);
  assert.match(
    apiSource,
    /revokeDevice[\s\S]*?idempotencyKey:\s*string[\s\S]*?["']Idempotency-Key["']:\s*idempotencyKey/,
  );
  assert.match(devicesSource, /createDeviceOperationIdempotencyKey\("revoke"/);
  assert.match(devicesSource, /smartHealthApi\.revokeDevice\([\s\S]{0,180}operationKey/);
});

test("rotates device credentials without operator secrets or premature success", async () => {
  const [dialogSource, apiSource] = await Promise.all([
    readFile(rotateDeviceSecretPath, "utf8"),
    readFile(apiPath, "utf8"),
  ]);

  assert.match(
    apiSource,
    /rotateDeviceSecret[\s\S]*?headers:\s*\{\s*["']Idempotency-Key["']:\s*idempotencyKey\s*\}[\s\S]*?body:\s*JSON\.stringify\(\{\}\)/,
  );
  assert.doesNotMatch(
    dialogSource,
    /type=["']password["']|name=["'](?:deviceSecret|nextSecret)["']/i,
  );
  assert.match(dialogSource, /smartHealthApi\.getDevice\(deviceId, controller\.signal\)/);
  assert.match(dialogSource, /submitInFlightRef/);
  assert.match(dialogSource, /if\s*\(\s*!nextOpen\s*&&\s*submitInFlightRef\.current\s*\)\s*return/);
  assert.match(
    dialogSource,
    /onEscapeKeyDown=\{[\s\S]*?submitInFlightRef\.current[\s\S]*?preventDefault\(\)/,
  );
  assert.match(
    dialogSource,
    /onPointerDownOutside=\{[\s\S]*?submitInFlightRef\.current[\s\S]*?preventDefault\(\)/,
  );
  assert.match(
    dialogSource,
    /isDeviceRotationTerminal\(latest\.state\)[\s\S]{0,160}idempotencyKeyRef\.current\s*=\s*["']["']/,
  );
  assert.match(dialogSource, /latest\.state\s*===\s*["']confirmed["'][\s\S]{0,220}toast\.success/);
  assert.doesNotMatch(dialogSource, /toast\.success[\s\S]{0,220}pending_device_ack|confirming/);
});

test("does not expose raw event JSON and exposes retryable live states", async () => {
  const devicesSource = await readFile(devicesPath, "utf8");

  assert.doesNotMatch(devicesSource, /JSON\.stringify\(event\.payload\)/);
  assert.match(devicesSource, /summarizeDeviceEvent/);
  assert.match(devicesSource, /aria-live=["']polite["']/);
  assert.match(devicesSource, /Thử tải lại/);
  assert.match(devicesSource, /Chỉ Platform Admin/);
});

test("uses the accessible danger text token for device presence labels", async () => {
  const devicesSource = await readFile(devicesPath, "utf8");

  assert.match(devicesSource, /tracking-wide text-danger-text/);
  assert.doesNotMatch(devicesSource, /tracking-wide text-destructive/);
});

test("claims readiness only after backend online confirmation", async () => {
  const activateSource = await readFile(activatePath, "utf8");

  assert.match(activateSource, /pairing\.onlineConfirmed/);
  assert.match(
    activateSource,
    /await smartHealthApi\.activateDeviceByClaim[\s\S]{0,900}setClaimCode\(""\)/,
    "one-time claim proof must be cleared from component state after backend acceptance",
  );
  assert.match(activateSource, /Đang chờ thiết bị xác thực trực tuyến/);
  assert.doesNotMatch(activateSource, /Thiết bị đã sẵn sàng sử dụng\./);
});

test("requires every signed OTA manifest field in the admin form", async () => {
  const devicesSource = await readFile(devicesPath, "utf8");

  for (const field of [
    "firmwareVersion",
    "checksum",
    "hardwareTarget",
    "partitionTarget",
    "minimumProtocolVersion",
  ]) {
    assert.match(devicesSource, new RegExp(field));
  }
  assert.match(devicesSource, /HTTPS/);
  assert.doesNotMatch(devicesSource, /HTTPS\/HTTP/);
});

test("waits for backend OTA confirmation instead of treating command applied as success", async () => {
  const devicesSource = await readFile(devicesPath, "utf8");

  assert.match(devicesSource, /pollDeviceOtaToTerminal/);
  assert.match(devicesSource, /smartHealthApi\.getDevice\(deviceId, signal\)/);
  assert.match(
    devicesSource,
    /result\.command\.type\s*===\s*["']ota\.update["'][\s\S]{0,180}result\.command\.state\s*===\s*["']applied["'][\s\S]{0,240}toast\.info/,
  );
  assert.match(
    devicesSource,
    /trackOta\(device\.id, result\.device,[\s\S]{0,180}commandId:\s*result\.command\.id/,
  );
  assert.match(devicesSource, /reconnect WSS và telemetry đúng phiên bản/);
  assert.doesNotMatch(
    devicesSource,
    /result\.command\.type\s*===\s*["']ota\.update["'][\s\S]{0,100}result\.command\.state\s*===\s*["']applied["']\s*\)\s*\{\s*toast\.success/,
  );
});

test("submits and types every inventory field rendered by the add-device form", async () => {
  const [addDeviceSource, apiSource, devicesSource] = await Promise.all([
    readFile(addDevicePath, "utf8"),
    readFile(apiPath, "utf8"),
    readFile(devicesPath, "utf8"),
  ]);

  for (const field of ["type", "manufacturer", "model", "serialNumber", "purchaseDate"]) {
    assert.match(apiSource, new RegExp(`${field}\\?: string`));
    assert.match(devicesSource, new RegExp(`selectedDevice\\.${field}`));
  }
  assert.match(addDeviceSource, /type:\s*formData\.deviceType/);
  assert.match(addDeviceSource, /manufacturer:\s*formData\.manufacturer/);
  assert.match(addDeviceSource, /model:\s*formData\.model/);
  assert.match(addDeviceSource, /serialNumber:\s*formData\.serialNumber/);
  assert.match(addDeviceSource, /purchaseDate:\s*formData\.purchaseDate/);
});

test("never accepts a raw factory device credential in the Admin provisioning flow", async () => {
  const [addDeviceSource, apiSource, smokeSource] = await Promise.all([
    readFile(addDevicePath, "utf8"),
    readFile(apiPath, "utf8"),
    readFile(adminMutationSmokePath, "utf8"),
  ]);

  assert.doesNotMatch(addDeviceSource, /deviceSecret|confirmDeviceSecret|Secret thiết bị/);
  assert.doesNotMatch(apiSource, /createDeviceProvision[\s\S]{0,600}deviceSecret/);
  assert.match(addDeviceSource, /Credential phải được nạp bằng quy trình factory bảo mật/);
  assert.match(addDeviceSource, /Admin không nhập, xem hoặc gửi raw device secret/);
  assert.match(addDeviceSource, /id="deviceId"[\s\S]{0,120}required/);
  assert.doesNotMatch(smokeSource, /deviceSecret|randomBytes/);
  assert.match(smokeSource, /SMOKE_FACTORY_DEVICE_ID/);
  assert.match(smokeSource, /dedicated factory-enrolled inventory record/);
});

test("keeps the one-time claim code inside the dialog instead of a persistent toast", async () => {
  const addDeviceSource = await readFile(addDevicePath, "utf8");

  assert.match(addDeviceSource, /Claim code:\s*\{provisionArtifact\.claimCode\}/);
  assert.doesNotMatch(addDeviceSource, /description:\s*`Claim code:/);
});

test("renders one complete canonical provisioning artifact and clears stale artifacts", async () => {
  const [addDeviceSource, apiSource] = await Promise.all([
    readFile(addDevicePath, "utf8"),
    readFile(apiPath, "utf8"),
  ]);

  assert.match(apiSource, /SmartHealthDeviceProvisionResponse/);
  assert.match(apiSource, /qrPayload:\s*ShcareDeviceSetupQrPayload/);
  assert.match(addDeviceSource, /parseProvisionArtifact\(response\)/);
  assert.match(addDeviceSource, /QRCodeSVG/);
  assert.match(addDeviceSource, /serializeProvisionQrPayload\(provisionArtifact\)/);
  assert.match(addDeviceSource, /provisionArtifact\.deviceId/);
  assert.match(addDeviceSource, /provisionArtifact\.expiresAt/);
  assert.match(addDeviceSource, /provisionArtifact\.qrPayload\.setupAp\.ssid/);
  assert.match(addDeviceSource, /createProvisionArtifactFilename\(provisionArtifact\)/);
  assert.match(addDeviceSource, /const updateFormData[\s\S]{0,240}setProvisionArtifact\(null\)/);
  assert.match(
    addDeviceSource,
    /setIsSubmitting\(true\)[\s\S]{0,180}setProvisionArtifact\(null\)/,
    "a fresh submit must remove an artifact from a previous intent before the request begins",
  );
  assert.doesNotMatch(addDeviceSource, /setClaimCode\(/);
  assert.doesNotMatch(addDeviceSource, /localStorage|sessionStorage/);
});

test("does not invent a setup SSID from the device suffix", async () => {
  const devicesSource = await readFile(devicesPath, "utf8");

  assert.doesNotMatch(devicesSource, /deviceSuffix\(selectedDevice\)/);
  assert.doesNotMatch(devicesSource, /SmartHealth-\{/);
  assert.match(devicesSource, /SSID\/PoP chỉ xuất hiện trong artifact QR/);
  assert.match(devicesSource, /factory state/);
  assert.match(devicesSource, /thao tác vật lý/);
  assert.match(devicesSource, /http:\/\/192\.168\.4\.1/);
});

test("associates add-device labels and names with their form controls", async () => {
  const addDeviceSource = await readFile(addDevicePath, "utf8");

  assert.match(addDeviceSource, /htmlFor=\{id\}/);
  assert.match(addDeviceSource, /aria-label="Đóng hộp thoại thêm thiết bị"/);
  for (const field of [
    "deviceId",
    "deviceName",
    "deviceType",
    "organizationId",
    "manufacturer",
    "model",
    "serialNumber",
    "purchaseDate",
  ]) {
    assert.match(addDeviceSource, new RegExp(`id="${field}"`));
    assert.match(addDeviceSource, new RegExp(`name="${field}"`));
  }
});

test("keeps add-device dismissal blocked for the full pending request", async () => {
  const addDeviceSource = await readFile(addDevicePath, "utf8");

  assert.match(addDeviceSource, /useRef<\s*boolean\s*>\(false\)/);
  assert.match(addDeviceSource, /if\s*\(\s*submitInFlightRef\.current\s*\)\s*return/);
  assert.match(addDeviceSource, /if\s*\(\s*!nextOpen\s*&&\s*isDismissBlocked\(\)\s*\)\s*return/);
  assert.match(
    addDeviceSource,
    /onEscapeKeyDown=\{[\s\S]*?isDismissBlocked\(\)[\s\S]*?preventDefault\(\)/,
  );
  assert.match(
    addDeviceSource,
    /onPointerDownOutside=\{[\s\S]*?isDismissBlocked\(\)[\s\S]*?preventDefault\(\)/,
  );
  assert.match(
    addDeviceSource,
    /onInteractOutside=\{[\s\S]*?isDismissBlocked\(\)[\s\S]*?preventDefault\(\)/,
  );
  assert.match(addDeviceSource, /disabled=\{isDismissBlocked\(\)\}/);
});

test("uses one provision idempotency key per retryable submit payload", async () => {
  const [addDeviceSource, apiSource] = await Promise.all([
    readFile(addDevicePath, "utf8"),
    readFile(apiPath, "utf8"),
  ]);

  assert.match(addDeviceSource, /provisionIdempotencyKeyRef/);
  assert.match(addDeviceSource, /createDeviceProvision\([\s\S]*?provisionIdempotencyKey/);
  assert.match(addDeviceSource, /provisionIdempotencyKeyRef\.current\s*=\s*null/);
  assert.match(apiSource, /async\s+createDeviceProvision\s*\(/);
  assert.match(apiSource, /idempotencyKey:\s*string/);
  assert.match(
    apiSource,
    /createDeviceProvision[\s\S]*?headers:\s*\{\s*["']Idempotency-Key["']:\s*idempotencyKey/,
  );
});

test("separates device creation success from refresh failures", async () => {
  const addDeviceSource = await readFile(addDevicePath, "utf8");

  assert.match(
    addDeviceSource,
    /try\s*\{\s*await onCreated\?\.\(\);[\s\S]*?toast\.error\("Đã tạo thiết bị nhưng chưa làm mới danh sách"/,
  );
  assert.match(addDeviceSource, /Đã tạo QR claim/);
  assert.doesNotMatch(
    addDeviceSource,
    /catch\s*\(error\)\s*\{[\s\S]*?await onCreated\?\.\(\)[\s\S]*?Không thể đăng ký thiết bị/,
  );
});

test("renders optional telemetry health without inventing device values", async () => {
  const [devicesSource, apiSource] = await Promise.all([
    readFile(devicesPath, "utf8"),
    readFile(apiPath, "utf8"),
  ]);

  for (const field of [
    "uptimeMs",
    "freeHeapBytes",
    "i2sStatus",
    "audioPacketsDropped",
    "lastCommandState",
    "otaStatus",
  ]) {
    assert.match(apiSource, new RegExp(field));
    assert.match(devicesSource, new RegExp(field));
  }
  assert.match(devicesSource, /Dữ liệu sức khỏe thiết bị/);
  assert.match(devicesSource, /Thiết bị chưa gửi dữ liệu sức khỏe/);
  assert.match(devicesSource, /formatTelemetryUptime/);
  assert.match(devicesSource, /formatTelemetryBytes/);
  assert.match(devicesSource, /formatTelemetryCount/);
  assert.match(devicesSource, /hasReportedTelemetry\(selectedDevice\.telemetry\)/);
  assert.match(devicesSource, /\[overflow-wrap:anywhere\]/);
  assert.match(devicesSource, /formatRelative\(device\.lastSeenAt\)/);
  assert.doesNotMatch(devicesSource, /lastSeenAt\s*\|\|\s*device\.updatedAt/);
});
