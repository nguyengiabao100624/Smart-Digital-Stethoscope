import assert from "node:assert/strict";
import test from "node:test";

import {
  assertStorageDeleteOutcome,
  createStorageOperationIdempotencyKey,
  parseStorageBucketOutcome,
  parseStorageFilesResponse,
  parseStorageFileOutcome,
  parseStorageShareOutcome,
  parseStorageStatsResponse,
} from "../../src/lib/storage-operations.ts";
import { toVietnameseErrorMessage } from "../../src/lib/error-messages.ts";

test("accepts exact canonical storage mutation outcomes", () => {
  const bucket = parseStorageBucketOutcome(
    {
      bucket: {
        id: "clinic-reports",
        name: "clinic-reports",
        description: "Báo cáo phòng khám",
        used: 0,
        files: 0,
        maxFileSizeMb: 200,
        system: false,
      },
    },
    "clinic-reports",
  );
  assert.equal(bucket.id, "clinic-reports");

  const file = parseStorageFileOutcome(
    {
      file: {
        id: "storage_file_1",
        name: "report.pdf",
        bucket: "clinic-reports",
        type: "pdf",
        size: "1 KB",
        uploader: "Platform Admin",
        uploadedAt: "19/07/2026 10:00",
        byteSize: 1024,
        visibility: "private",
      },
    },
    { name: "report.pdf", bucket: "clinic-reports" },
  );
  assert.equal(file.visibility, "private");

  assert.doesNotThrow(() =>
    assertStorageDeleteOutcome({ deleted: true, fileId: file.id }, "fileId", file.id),
  );
  assert.deepEqual(
    parseStorageShareOutcome({
      shareUrl: "https://storage.example/signed-file",
      expiresInSeconds: 900,
    }),
    {
      shareUrl: "https://storage.example/signed-file",
      expiresInSeconds: 900,
    },
  );
});

test("rejects malformed, mismatched, or unsafe storage success responses", () => {
  assert.throws(
    () => parseStorageBucketOutcome({ bucket: {} }, "clinic-reports"),
    /thiếu ID bucket canonical/,
  );
  assert.throws(
    () =>
      parseStorageFileOutcome(
        {
          file: {
            id: "storage_file_1",
            name: "other.pdf",
            bucket: "clinic-reports",
            type: "pdf",
            size: "1 KB",
            uploader: "Platform Admin",
            uploadedAt: "19/07/2026 10:00",
            byteSize: 1024,
          },
        },
        { name: "report.pdf", bucket: "clinic-reports" },
      ),
    /chưa xác nhận đúng tệp/,
  );
  assert.throws(
    () => assertStorageDeleteOutcome({ deleted: false, fileId: "file-1" }, "fileId", "file-1"),
    /chưa xác nhận tài nguyên storage/,
  );
  assert.throws(
    () => parseStorageShareOutcome({ shareUrl: "/api/admin/storage-files/file-1/share" }),
    /liên kết chia sẻ HTTPS hợp lệ/,
  );
});

test("creates operation-scoped storage idempotency keys", () => {
  const first = createStorageOperationIdempotencyKey("file-upload", "clinic-reports");
  const second = createStorageOperationIdempotencyKey("file-upload", "clinic-reports");
  assert.match(first, /^admin-storage-file-upload-clinic-reports-/);
  assert.notEqual(first, second);
});

test("presents provider-unavailable storage outcomes explicitly", () => {
  assert.match(
    toVietnameseErrorMessage({
      code: "STORAGE_SHARE_PROVIDER_UNAVAILABLE",
      message: "Internal server error",
    }),
    /chưa khả dụng/,
  );
});

test("parses confirmed storage stats and owns semantic chart colors on the client", () => {
  const result = parseStorageStatsResponse({
    totalUsed: 1.5,
    totalFiles: 2,
    buckets: [
      {
        id: "heart-audio",
        name: "Âm thanh tim phổi",
        description: "Dữ liệu âm thanh",
        desc: "Dữ liệu âm thanh",
        iconKey: "audio",
        colorKey: "teal",
        category: "clinical",
        used: 1.5,
        files: 2,
        createdAt: "",
        allowedExtensions: ["wav"],
        allowedMimeTypes: ["audio/wav"],
        maxFileSizeMb: 100,
        system: true,
      },
    ],
    growthData: [{ day: "2026-07-23", gb: 1.5 }],
    typeData: [{ name: "WAV", value: 1.5, color: "#ffffff" }],
    topBuckets: [{ name: "Âm thanh tim phổi", gb: 1.5 }],
    recentActivity: [
      {
        action: "upload",
        who: "Bác sĩ",
        what: "đã tải tệp",
        target: "scan.wav",
        when: "23/07/2026 10:00",
      },
    ],
    topClinicUsage: [{ name: "Phòng khám A", gb: 1.5, percent: 100 }],
  });

  assert.equal(result.totalFiles, 2);
  assert.equal(result.typeData[0]?.color, "var(--chart-1)");
});

test("parses private storage files and rejects unconfirmed or contradictory read models", () => {
  const result = parseStorageFilesResponse({
    files: [
      {
        id: "file-1",
        name: "scan.wav",
        bucket: "heart-audio",
        type: "wav",
        size: "1.5 GB",
        uploader: "Bác sĩ",
        uploadedAt: "23/07/2026 10:00",
        createdAt: "2026-07-23T03:00:00.000Z",
        byteSize: 1610612736,
        visibility: "private",
        tags: ["audio"],
      },
    ],
  });
  assert.equal(result.files[0]?.id, "file-1");

  assert.throws(
    () =>
      parseStorageStatsResponse({
        totalUsed: 2,
        totalFiles: 0,
        buckets: [],
        growthData: [],
        typeData: [],
        topBuckets: [],
        recentActivity: [],
        topClinicUsage: [],
      }),
    /Tổng dung lượng storage không khớp/,
  );
  assert.throws(
    () =>
      parseStorageFilesResponse({
        files: [
          {
            id: "file-1",
            name: "scan.wav",
            bucket: "heart-audio",
            type: "wav",
            size: "1 KB",
            uploader: "Bác sĩ",
            uploadedAt: "23/07/2026 10:00",
            visibility: "public",
          },
        ],
      }),
    /visibility không an toàn/,
  );
});
