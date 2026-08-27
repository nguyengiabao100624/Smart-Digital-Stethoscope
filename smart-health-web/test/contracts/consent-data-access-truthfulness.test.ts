import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pagePath = new URL(
  "../../src/app/pages/portal/InvitationsPage.tsx",
  import.meta.url,
);
const apiPath = new URL("../../src/lib/smart-health-api.ts", import.meta.url);
const routeContractPath = new URL(
  "../../src/app/contracts/route-contract.ts",
  import.meta.url,
);

test("patient-share mutations require a stable idempotency key", async () => {
  const [page, api] = await Promise.all([
    readFile(pagePath, "utf8"),
    readFile(apiPath, "utf8"),
  ]);

  assert.match(api, /createPatientShare:[\s\S]*idempotencyKey: string/);
  assert.match(api, /revokePatientShare:[\s\S]*idempotencyKey: string/);
  assert.match(api, /headers: \{ "Idempotency-Key": idempotencyKey \}/);
  assert.match(page, /createShareIntentKey/);
  assert.match(page, /createIntentKey/);
  assert.match(page, /revokeIntent/);
});

test("Portal reads authority and status from backend instead of inventing consent", async () => {
  const [source, api] = await Promise.all([
    readFile(pagePath, "utf8"),
    readFile(apiPath, "utf8"),
  ]);

  assert.match(source, /share\.authorityType/);
  assert.match(source, /share\.status === "active"/);
  assert.match(source, /share\.grantedByActor/);
  assert.match(source, /share\.revokedByActor/);
  assert.match(api, /workspaceId: string/);
  assert.match(api, /authorityType: PatientShareAuthorityType/);
  assert.match(api, /status: PatientShareStatus/);
  assert.match(api, /recipient: PatientShareRecipient/);
  assert.match(api, /grantedByActor\?: PatientShareActor/);
  assert.match(api, /revokedByActor\?: PatientShareActor/);
  assert.match(source, /patient_consent/);
  assert.match(source, /clinician_access_grant/);
  assert.match(source, /administrative_assignment/);
  assert.match(source, /Loại quyền chưa được backend xác định/);
  assert.match(source, /Trạng thái chưa được backend xác định/);
  assert.doesNotMatch(source, /active:\s*false|setQueryData/);
  assert.doesNotMatch(source, /doctors\.get|workspaces\.get|recipientId\s*\|\|/);
});

test("direct clinician access and administrative assignment have distinct Portal UX", async () => {
  const source = await readFile(pagePath, "utf8");

  assert.match(source, /Truy cập trực tiếp/);
  assert.match(source, /Phân công hành chính/);
  assert.match(source, /components\/ui\/alert-dialog/);
  assert.match(source, /components\/ui\/card/);
  assert.match(source, /components\/ui\/radio-group/);
  assert.match(source, /md:hidden/);
  assert.match(source, /hidden overflow-hidden shadow-sm md:block/);
  assert.match(source, /role="region"/);
  assert.match(source, /aria-label="Sổ quyền truy cập dữ liệu"/);
  assert.match(source, /tabIndex=\{0\}/);
  assert.match(source, /overflow-x-auto focus-visible:/);
  assert.doesNotMatch(source, /glass-panel|premium-button|hero-gradient-text/);
});

test("consent ledger covers permission, offline, retry and confirmed revoke states", async () => {
  const source = await readFile(pagePath, "utf8");

  assert.match(source, /PermissionState/);
  assert.match(source, /OfflineState/);
  assert.match(source, /ConsentError/);
  assert.match(source, /Thử lại/);
  assert.match(source, /data-share-revoke-confirm/);
  assert.match(source, /!payload\.revoked/);
  assert.match(source, /role="alert"/);
  assert.match(source, /hasCanonicalPatientShareContract/);
  assert.match(source, /invalidShareContract/);
  assert.match(source, /matchesPatientShareIntent/);
  assert.match(source, /share\.recipient\.id === expectedRecipientId/);
  assert.match(source, /payload\.share\.status !== "active"/);
  assert.match(source, /payload\.share\.status !== "revoked"/);
  assert.match(source, /payload\.share\.active !== false/);
  assert.match(source, /payload\.share\.audit\.revokedAt/);
});

test("consent route exposes only capabilities accepted by the backend mutation boundary", async () => {
  const source = await readFile(routeContractPath, "utf8");
  const capabilityBlock = source.match(
    /const CONSENT_CAPABILITIES = \[([\s\S]*?)\] as const;/,
  )?.[1];

  assert.ok(capabilityBlock);
  assert.match(capabilityBlock, /platform\.patients\.manage/);
  assert.match(capabilityBlock, /workspace\.patients\.manage/);
  assert.match(capabilityBlock, /personal\.sharing\.manage/);
  assert.doesNotMatch(capabilityBlock, /workspace\.patients\.view/);
  assert.doesNotMatch(capabilityBlock, /workspace\.staff\.manage/);
});
