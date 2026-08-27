import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const storagePath = new URL("../../src/components/admin/Storage.tsx", import.meta.url);
const createBucketPath = new URL(
  "../../src/components/admin/dialogs/CreateBucketDialog.tsx",
  import.meta.url,
);
const uploadFilePath = new URL(
  "../../src/components/admin/dialogs/UploadFileDialog.tsx",
  import.meta.url,
);
const fileDetailPath = new URL(
  "../../src/components/admin/dialogs/FileDetailDialog.tsx",
  import.meta.url,
);
const apiPath = new URL("../../src/lib/smart-health-api.ts", import.meta.url);

test("storage overview renders backend facts without quota or synthetic KPI claims", async () => {
  const source = await readFile(storagePath, "utf8");

  assert.match(source, /Tệp mới tải gần đây/);
  assert.match(source, /clampPercent\(clinic\.percent\)/);
  assert.doesNotMatch(source, /c\.percent \* 3\.5/);
  assert.doesNotMatch(source, /totalQuota|b\.quota|Quota theo phòng khám/);
  assert.doesNotMatch(source, /1,284|3\.8 TB|4,280|\+12\.4%|\+1\.2k hôm nay/);
  assert.doesNotMatch(source, /Lọc nâng cao|requestDeleteSelectedFiles|Xóa các tệp đã chọn/);
  assert.doesNotMatch(source, /DEFAULT_STORAGE_STATS|statsData\s*\|\|/);
  assert.match(source, /Promise\.allSettled/);
  assert.match(source, /statsError/);
  assert.match(source, /filesError/);
  assert.match(source, /Dữ liệu đang hiển thị là bản đã được backend xác nhận gần nhất/);
  assert.match(source, /Không hiển thị số liệu thay thế cho phần chưa tải được/);
});

test("storage read models fail closed and partial failures stay independently recoverable", async () => {
  const [source, operations, api] = await Promise.all([
    readFile(storagePath, "utf8"),
    readFile(new URL("../../src/lib/storage-operations.ts", import.meta.url), "utf8"),
    readFile(apiPath, "utf8"),
  ]);

  assert.match(source, /parseStorageStatsResponse\(statsResult\.value\)/);
  assert.match(source, /parseStorageFilesResponse\(filesResult\.value\)/);
  assert.match(source, /canUploadStorage = canManageStorage && Boolean\(statsData\)/);
  assert.match(operations, /export function parseStorageStatsResponse/);
  assert.match(operations, /export function parseStorageFilesResponse/);
  assert.match(operations, /STORAGE_CHART_COLORS/);
  assert.match(api, /async getStorageStats\(\)[\s\S]{0,180}requestJson<unknown>/);
  assert.match(api, /async listStorageFiles\([\s\S]{0,420}SmartHealthListPagination/);
  assert.match(source, /filesResult\.value\.pagination/);
  assert.match(source, /pageSize=\{pagination\.limit\}/);
  assert.match(source, /totalItems=\{pagination\.totalCount\}/);
});

test("bucket lifecycle is visibly restricted to Platform Admin", async () => {
  const source = await readFile(storagePath, "utf8");

  assert.match(
    source,
    /const canManageBucketLifecycle =\s*isPlatformAdmin && hasCapability\("platform\.storage\.manage"\)/,
  );
  assert.match(source, /Chỉ Platform Admin/);
  assert.match(source, /open=\{canManageBucketLifecycle && bucketOpen\}/);
  assert.match(source, /if \(!canManageBucketLifecycle\)[\s\S]*?throw new Error/);
});

test("bucket creation omits unsupported lifecycle and security controls", async () => {
  const source = await readFile(createBucketPath, "utf8");

  assert.doesNotMatch(source, /quotaGb|retentionDays|encryptionRequired/);
  assert.doesNotMatch(source, /setVisibility|Globe2|Công khai/);
  assert.match(source, /Chưa có hợp đồng thực thi/);
  assert.match(source, /onCreate: \(payload: BucketCreatePayload, idempotencyKey: string\)/);
  assert.match(source, /attemptRef\.current\?\.fingerprint === fingerprint/);
  assert.match(source, /onCreate\(payload, idempotencyKey\)/);
  assert.doesNotMatch(source, /if \(onCreate\)|toast\.success\(`Đã tạo bucket/);
});

test("multi-file upload keeps truthful per-file outcomes and retries failures only", async () => {
  const source = await readFile(uploadFilePath, "utf8");

  assert.match(source, /status: "ready" \| "uploading" \| "succeeded" \| "failed" \| "invalid"/);
  assert.match(source, /const retryableFiles = files\.filter/);
  assert.match(source, /Chỉ những tệp lỗi sẽ được thử lại/);
  assert.match(source, /onUpload: \(payload: UploadPayload\)/);
  assert.match(source, /idempotencyKey: item\.idempotencyKey/);
  assert.match(source, /createStorageOperationIdempotencyKey\(/);
  assert.doesNotMatch(source, /progress:\s*35|progress:\s*100|Math\.round\(item\.progress\)/);
  assert.doesNotMatch(source, /FALLBACK_BUCKETS|visibility|Globe2|Công khai/);
  assert.doesNotMatch(source, /if \(onUpload\)/);
});

test("storage actions require canonical confirmation before success UI", async () => {
  const [source, apiSource] = await Promise.all([
    readFile(storagePath, "utf8"),
    readFile(apiPath, "utf8"),
  ]);

  assert.match(source, /parseStorageBucketOutcome\(response, payload\.name\)/);
  assert.match(source, /parseStorageFileOutcome\(response/);
  assert.match(source, /assertStorageDeleteOutcome\(response, "fileId", file\.id\)/);
  assert.match(source, /parseStorageShareOutcome\(response\)/);
  assert.match(source, /onShare=\{canManageStorage \? shareStorageFile : undefined\}/);
  assert.match(apiSource, /"Idempotency-Key": payload\.idempotencyKey/);
  assert.match(apiSource, /deleteStorageFile\(fileId: string, idempotencyKey: string\)/);
  assert.match(apiSource, /shareStorageFile\(fileId: string, idempotencyKey: string\)/);
});

test("file detail never presents endpoint URLs, fake access history, or unsupported encryption", async () => {
  const source = await readFile(fileDetailPath, "utf8");

  assert.match(source, /value="Theo quyền workspace"/);
  assert.match(source, /generatedShareLink\?\.fileId === file\.id/);
  assert.doesNotMatch(source, /file\.shareUrl \|\| file\.downloadUrl/);
  assert.doesNotMatch(source, /Mã hóa AES-256|Lịch sử truy cập|Quản trị viên mở chi tiết tệp/);
  assert.doesNotMatch(source, /Globe2|Shield/);
});
