const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createStorageAdapter } = require("../src/storageAdapter");

function localAdapter(root) {
  return createStorageAdapter({
    dataDir: root,
    env: {
      OBJECT_STORAGE_PROVIDER: "local",
      LOCAL_OBJECT_STORAGE_DIR: path.join(root, "objects"),
    },
  });
}

test("finite local reads stream bytes and enforce the limit after a stale size check", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "shcare-bounded-local-"));
  const adapter = localAdapter(root);
  const key = "firmware/replaced.bin";
  await adapter.putBuffer(key, Buffer.from("12345678"));

  const originalStat = fs.promises.stat;
  const originalReadFile = fs.promises.readFile;
  fs.promises.stat = async (...args) => {
    const stat = await originalStat(...args);
    return { ...stat, size: 2 };
  };
  fs.promises.readFile = async () => {
    throw new Error("finite getBuffer must not use an unbounded readFile");
  };
  try {
    await assert.rejects(
      adapter.getBuffer(key, 4),
      (error) => error?.code === "STORAGE_OBJECT_TOO_LARGE",
    );
  } finally {
    fs.promises.stat = originalStat;
    fs.promises.readFile = originalReadFile;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("finite S3 reads ignore untrusted ContentLength and never use transformToByteArray", async () => {
  let transformCalled = false;
  const body = {
    async *[Symbol.asyncIterator]() {
      yield Buffer.from("123");
      yield Buffer.from("456");
    },
    async transformToByteArray() {
      transformCalled = true;
      return Buffer.alloc(1024 * 1024);
    },
  };
  const adapter = createStorageAdapter({
    env: {
      OBJECT_STORAGE_PROVIDER: "s3",
      OBJECT_STORAGE_BUCKET: "private-firmware",
    },
    s3ClientFactory: async () => ({
      async send() {
        return { Body: body, ContentLength: false };
      },
    }),
  });

  await assert.rejects(
    adapter.getBuffer("firmware/object.bin", 5),
    (error) => error?.code === "STORAGE_OBJECT_TOO_LARGE",
  );
  assert.equal(transformCalled, false);
});

test("finite S3 reads return the streamed length when the object was truncated", async () => {
  const body = {
    async *[Symbol.asyncIterator]() {
      yield Buffer.from("short");
    },
  };
  const adapter = createStorageAdapter({
    env: {
      OBJECT_STORAGE_PROVIDER: "s3",
      OBJECT_STORAGE_BUCKET: "private-firmware",
    },
    s3ClientFactory: async () => ({
      async send() {
        return { Body: body, ContentLength: 200 };
      },
    }),
  });

  assert.deepEqual(
    await adapter.getBuffer("firmware/truncated.bin", 256),
    Buffer.from("short"),
  );
});
