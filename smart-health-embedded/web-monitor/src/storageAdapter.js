const fs = require("node:fs");
const path = require("node:path");

function readString(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function assertObjectSizeWithinLimit(byteSize, maxBytes) {
  if (!Number.isFinite(maxBytes)) return;
  if (!Number.isFinite(byteSize) || byteSize < 0 || byteSize > maxBytes) {
    const error = new Error(`Storage object exceeds the ${maxBytes}-byte limit`);
    error.code = "STORAGE_OBJECT_TOO_LARGE";
    throw error;
  }
}

async function collectStreamWithLimit(body, maxBytes = Number.POSITIVE_INFINITY) {
  if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
    const buffer = Buffer.from(body);
    assertObjectSizeWithinLimit(buffer.length, maxBytes);
    return buffer;
  }

  const chunks = [];
  let totalBytes = 0;
  const append = (chunk) => {
    const normalized = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += normalized.length;
    assertObjectSizeWithinLimit(totalBytes, maxBytes);
    chunks.push(normalized);
  };

  if (body && typeof body[Symbol.asyncIterator] === "function") {
    try {
      for await (const chunk of body) append(chunk);
    } catch (error) {
      if (typeof body.destroy === "function") body.destroy(error);
      throw error;
    }
    return Buffer.concat(chunks, totalBytes);
  }

  if (body && typeof body.getReader === "function") {
    const reader = body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        append(value);
      }
    } catch (error) {
      await reader.cancel(error).catch(() => {});
      throw error;
    } finally {
      reader.releaseLock();
    }
    return Buffer.concat(chunks, totalBytes);
  }

  if (
    maxBytes === Number.POSITIVE_INFINITY &&
    body &&
    typeof body.transformToByteArray === "function"
  ) {
    return Buffer.from(await body.transformToByteArray());
  }

  const error = new Error("Storage object body does not support bounded streaming");
  error.code = "STORAGE_BODY_NOT_STREAMABLE";
  throw error;
}

function createStorageAdapter(options = {}) {
  const env = options.env || process.env;
  const provider = readString(env.OBJECT_STORAGE_PROVIDER, "local").toLowerCase();
  const dataDir = options.dataDir || path.join(__dirname, "..", "data");
  const localRoot = path.resolve(env.LOCAL_OBJECT_STORAGE_DIR || path.join(dataDir, "objects"));
  fs.mkdirSync(localRoot, { recursive: true });

  async function putLocalFile(objectKey, sourceFile, contentType = "application/octet-stream") {
    const target = path.join(localRoot, objectKey.split("/").map((part) => path.basename(part)).join(path.sep));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    await fs.promises.copyFile(sourceFile, target);
    const stat = await fs.promises.stat(target);
    return {
      provider: "local",
      objectKey,
      contentType,
      byteSize: stat.size,
      localPath: target,
    };
  }

  async function putLocalBuffer(objectKey, buffer, contentType = "application/octet-stream") {
    const target = path.join(localRoot, objectKey.split("/").map((part) => path.basename(part)).join(path.sep));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    await fs.promises.writeFile(target, buffer);
    return {
      provider: "local",
      objectKey,
      contentType,
      byteSize: buffer.length,
      localPath: target,
    };
  }

  async function createS3Client() {
    if (typeof options.s3ClientFactory === "function") {
      return options.s3ClientFactory();
    }
    const { S3Client } = require("@aws-sdk/client-s3");
    return new S3Client({
      region: env.S3_REGION || "auto",
      endpoint: env.S3_ENDPOINT || undefined,
      forcePathStyle: String(env.S3_FORCE_PATH_STYLE || "").toLowerCase() === "true",
      credentials:
        env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
          ? {
              accessKeyId: env.S3_ACCESS_KEY_ID,
              secretAccessKey: env.S3_SECRET_ACCESS_KEY,
            }
          : undefined,
    });
  }

  async function putFile(objectKey, sourceFile, contentType = "application/octet-stream") {
    if (provider !== "s3") {
      return putLocalFile(objectKey, sourceFile, contentType);
    }

    const { PutObjectCommand } = require("@aws-sdk/client-s3");
    const client = await createS3Client();
    const bucket = readString(env.OBJECT_STORAGE_BUCKET);
    if (!bucket) {
      throw new Error("OBJECT_STORAGE_BUCKET is required when OBJECT_STORAGE_PROVIDER=s3");
    }
    const stat = await fs.promises.stat(sourceFile);
    const body = await fs.promises.readFile(sourceFile);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: body,
        ContentType: contentType,
        ContentLength: stat.size,
      }),
    );
    return {
      provider: "s3",
      objectKey,
      contentType,
      byteSize: stat.size,
    };
  }

  async function putBuffer(objectKey, buffer, contentType = "application/octet-stream") {
    if (provider !== "s3") {
      return putLocalBuffer(objectKey, buffer, contentType);
    }

    const { PutObjectCommand } = require("@aws-sdk/client-s3");
    const client = await createS3Client();
    const bucket = readString(env.OBJECT_STORAGE_BUCKET);
    if (!bucket) {
      throw new Error("OBJECT_STORAGE_BUCKET is required when OBJECT_STORAGE_PROVIDER=s3");
    }
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: buffer,
        ContentType: contentType,
        ContentLength: buffer.length,
      }),
    );
    return {
      provider: "s3",
      objectKey,
      contentType,
      byteSize: buffer.length,
    };
  }

  async function getSignedUrl(objectKey, expiresInSeconds = 900) {
    if (provider !== "s3") {
      return `/api/v1/objects/local?key=${encodeURIComponent(objectKey)}`;
    }

    const { GetObjectCommand } = require("@aws-sdk/client-s3");
    const { getSignedUrl: presign } = require("@aws-sdk/s3-request-presigner");
    const client = await createS3Client();
    const bucket = readString(env.OBJECT_STORAGE_BUCKET);
    if (!bucket) {
      throw new Error("OBJECT_STORAGE_BUCKET is required when OBJECT_STORAGE_PROVIDER=s3");
    }
    return presign(client, new GetObjectCommand({ Bucket: bucket, Key: objectKey }), { expiresIn: expiresInSeconds });
  }

  async function getBuffer(objectKey, maxBytes = Number.POSITIVE_INFINITY) {
    if (!objectKey) {
      throw new Error("objectKey is required");
    }
    if (!(Number.isFinite(maxBytes) && maxBytes > 0) && maxBytes !== Number.POSITIVE_INFINITY) {
      throw new Error("maxBytes must be a positive number");
    }

    if (provider !== "s3") {
      const target = path.join(localRoot, objectKey.split("/").map((part) => path.basename(part)).join(path.sep));
      const resolved = path.resolve(target);
      if (!resolved.startsWith(localRoot)) {
        throw new Error("Invalid local object path");
      }
      const stat = await fs.promises.stat(resolved);
      assertObjectSizeWithinLimit(stat.size, maxBytes);
      const stream = fs.createReadStream(resolved);
      return collectStreamWithLimit(stream, maxBytes);
    }

    const { GetObjectCommand } = require("@aws-sdk/client-s3");
    const client = await createS3Client();
    const bucket = readString(env.OBJECT_STORAGE_BUCKET);
    if (!bucket) {
      throw new Error("OBJECT_STORAGE_BUCKET is required when OBJECT_STORAGE_PROVIDER=s3");
    }
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }));
    if (!response.Body) {
      return Buffer.alloc(0);
    }
    if (
      response.ContentLength !== undefined &&
      response.ContentLength !== null &&
      response.ContentLength !== false &&
      response.ContentLength !== ""
    ) {
      const contentLength = Number(response.ContentLength);
      if (Number.isFinite(contentLength) && contentLength >= 0) {
        assertObjectSizeWithinLimit(contentLength, maxBytes);
      }
    }
    return collectStreamWithLimit(response.Body, maxBytes);
  }

  async function deleteObject(objectKey) {
    if (!objectKey) {
      return { deleted: false };
    }

    if (provider !== "s3") {
      const target = path.join(localRoot, objectKey.split("/").map((part) => path.basename(part)).join(path.sep));
      const resolved = path.resolve(target);
      if (!resolved.startsWith(localRoot)) {
        return { deleted: false };
      }
      if (fs.existsSync(resolved)) {
        await fs.promises.rm(resolved, { force: true });
        return { deleted: true, provider: "local", objectKey };
      }
      return { deleted: false, provider: "local", objectKey };
    }

    const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
    const client = await createS3Client();
    const bucket = readString(env.OBJECT_STORAGE_BUCKET);
    if (!bucket) {
      throw new Error("OBJECT_STORAGE_BUCKET is required when OBJECT_STORAGE_PROVIDER=s3");
    }
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
    return { deleted: true, provider: "s3", objectKey };
  }

  return {
    provider,
    putFile,
    putBuffer,
    getBuffer,
    getSignedUrl,
    deleteObject,
  };
}

function buildScanObjectKey(orgId, patientId, scanId, fileName) {
  return `org/${orgId || "org_default_clinic"}/patients/${patientId}/scans/${scanId}/${fileName}`;
}

module.exports = {
  buildScanObjectKey,
  collectStreamWithLimit,
  createStorageAdapter,
};
