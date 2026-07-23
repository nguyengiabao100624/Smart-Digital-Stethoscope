const crypto = require("node:crypto");
const fs = require("node:fs");

const {
  SIGNAL_QUALITY_ANALYZER_VERSION,
  buildSignalQualityRawResult,
} = require("./aiRuntime");
const { processAudioFile } = require("./audioProcessing");
const { buildScanObjectKey, createStorageAdapter } = require("./storageAdapter");

function defaultNowIso() {
  return new Date().toISOString();
}

function hashIdentity(parts) {
  const hash = crypto.createHash("sha256");
  for (const part of parts) {
    hash.update(String(part ?? ""), "utf8");
    hash.update("\0", "utf8");
  }
  return hash.digest("hex");
}

function deterministicArtifactId(prefix, ...parts) {
  return `${prefix}_${hashIdentity(parts).slice(0, 40)}`;
}

async function hashFile(filePath) {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => hash.update(chunk));
    stream.once("error", reject);
    stream.once("end", () => resolve(hash.digest("hex")));
  });
}

function normalizeProcessingGeneration(value) {
  const candidate = value === undefined || value === null || value === "" ? 1 : Number(value);
  if (!Number.isSafeInteger(candidate) || candidate < 1) {
    throw new Error("processingGeneration must be a positive safe integer");
  }
  return candidate;
}

function buildProcessingRunId({
  scanId,
  sampleRate,
  contentSha256,
  processingGeneration,
  processingIntent,
}) {
  return `run_v1_${hashIdentity([
    scanId,
    sampleRate,
    contentSha256,
    processingGeneration,
    processingIntent,
    SIGNAL_QUALITY_ANALYZER_VERSION,
  ]).slice(0, 40)}`;
}

function findScanById(db, scanId) {
  return (db.scans || []).find((scan) => scan.id === scanId) || null;
}

function syncArrayItem(items, item) {
  const index = items.findIndex((existing) => existing.id === item.id);
  if (index >= 0) {
    items[index] = item;
    return item;
  }
  items.unshift(item);
  return item;
}

async function saveAudioArtifacts({
  db,
  repositories,
  saveDb,
  scan,
  audioFile,
  aiResult,
  processingGeneration,
  processingRunId,
}) {
  if (repositories && repositories.audioProcessing && typeof repositories.audioProcessing.save === "function") {
    await repositories.audioProcessing.save({
      scan,
      audioFile,
      aiResult,
      processingGeneration,
      processingRunId,
    });
    return;
  }

  // Keep compatibility with narrow test/dry-run repository adapters while
  // preserving all-or-nothing runtime state if one adapter fails.
  const snapshot = db && typeof db === "object"
    ? {
        scans: JSON.parse(JSON.stringify(db.scans || [])),
        audioFiles: JSON.parse(JSON.stringify(db.audioFiles || [])),
        aiResults: JSON.parse(JSON.stringify(db.aiResults || [])),
      }
    : null;
  try {
    if (repositories) {
      if (repositories.audioFiles && typeof repositories.audioFiles.save === "function") {
        await repositories.audioFiles.save(audioFile);
      }
      if (repositories.aiResults && typeof repositories.aiResults.save === "function") {
        await repositories.aiResults.save(aiResult);
      }
      if (repositories.scans && typeof repositories.scans.save === "function") {
        await repositories.scans.save(scan);
      }
      if (db && typeof db === "object") {
        db.scans = db.scans || [];
        db.audioFiles = db.audioFiles || [];
        db.aiResults = db.aiResults || [];
        syncArrayItem(db.scans, scan);
        syncArrayItem(db.audioFiles, audioFile);
        syncArrayItem(db.aiResults, aiResult);
        db.audioFiles = db.audioFiles.slice(0, 1000);
        db.aiResults = db.aiResults.slice(0, 1000);
      }
      return;
    }

    db.audioFiles = db.audioFiles || [];
    db.aiResults = db.aiResults || [];
    syncArrayItem(db.audioFiles, audioFile);
    syncArrayItem(db.aiResults, aiResult);
    db.audioFiles = db.audioFiles.slice(0, 1000);
    db.aiResults = db.aiResults.slice(0, 1000);
    syncArrayItem(db.scans = db.scans || [], scan);
    if (typeof saveDb === "function") {
      await saveDb(db);
    }
  } catch (error) {
    if (snapshot && db) {
      db.scans = snapshot.scans;
      db.audioFiles = snapshot.audioFiles;
      db.aiResults = snapshot.aiResults;
    }
    throw error;
  }
}

async function processAudioJob(payload, deps = {}) {
  const scanId = String(payload && payload.scanId ? payload.scanId : "");
  const wavFilePath = String(payload && payload.wavFilePath ? payload.wavFilePath : "");
  if (!scanId) {
    throw new Error("scanId is required");
  }
  if (!wavFilePath) {
    throw new Error("wavFilePath is required");
  }
  if (!fs.existsSync(wavFilePath)) {
    throw new Error(`WAV file not found: ${wavFilePath}`);
  }

  const db = deps.db || {};
  const repositories = deps.repositories || null;
  const nowIso = deps.nowIso || defaultNowIso;
  let scan =
    deps.scan ||
    (repositories && repositories.scans && typeof repositories.scans.findById === "function"
      ? await repositories.scans.findById(scanId)
      : null) ||
    findScanById(db, scanId);
  if (!scan) {
    throw new Error(`Scan not found: ${scanId}`);
  }
  // Never mutate a repository-owned object before the atomic persistence
  // boundary. A failed retry must leave the in-memory scan untouched.
  scan = { ...scan };

  const storageAdapter =
    deps.storageAdapter ||
    createStorageAdapter({
      dataDir: deps.dataDir,
      env: deps.env || process.env,
    });
  const requestedPatientId = String(payload.patientId || "");
  const scanPatientId = String(scan.patientId || "");
  if (requestedPatientId && scanPatientId && requestedPatientId !== scanPatientId) {
    throw new Error("Queued patientId does not match the canonical scan");
  }
  const patientId = scanPatientId || requestedPatientId;
  const scanOrganizationId =
    scan.organizationId ||
    (typeof deps.getScanOrgId === "function" ? deps.getScanOrgId(scan) : "") ||
    "";
  const requestedOrganizationId = String(payload.organizationId || "");
  if (
    requestedOrganizationId &&
    scanOrganizationId &&
    requestedOrganizationId !== scanOrganizationId
  ) {
    throw new Error("Queued organizationId does not match the canonical scan");
  }
  const organizationId = scanOrganizationId || requestedOrganizationId || "org_default_clinic";
  const sampleRate = Number(payload.sampleRate || scan.sampleRate || 16000);
  const contentSha256 = await hashFile(wavFilePath);
  const processingGeneration = normalizeProcessingGeneration(
    payload.processingGeneration ?? scan.processingGeneration,
  );
  const processingIntent =
    String(payload.processingIntent ?? scan.processingIntent ?? "initial").trim().toLowerCase() || "initial";
  const expectedArtifactFingerprint =
    String(payload.artifactFingerprint ?? scan.processingArtifactFingerprint ?? "").trim().toLowerCase();
  if (
    expectedArtifactFingerprint &&
    expectedArtifactFingerprint !== "unspecified" &&
    expectedArtifactFingerprint !== contentSha256
  ) {
    throw new Error("Audio artifact fingerprint does not match the queued processing intent");
  }
  const processingRunId = buildProcessingRunId({
    scanId: scan.id,
    sampleRate,
    contentSha256,
    processingGeneration,
    processingIntent,
  });
  const audioObjectKey = buildScanObjectKey(organizationId, patientId, scan.id, "audio.wav");
  const waveformObjectKey = buildScanObjectKey(organizationId, patientId, scan.id, "waveform.json");
  const audioUpload = await storageAdapter.putFile(audioObjectKey, wavFilePath, "audio/wav");
  const processed = await processAudioFile({ filePath: wavFilePath, scanId: scan.id, sampleRate });
  await storageAdapter.putBuffer(waveformObjectKey, Buffer.from(JSON.stringify(processed.waveform)), "application/json");

  db.audioFiles = db.audioFiles || [];
  db.aiResults = db.aiResults || [];
  const existingAudioFile =
    (repositories && repositories.audioFiles && typeof repositories.audioFiles.findByScanId === "function"
      ? await repositories.audioFiles.findByScanId(scan.id)
      : null) || db.audioFiles.find((file) => file.scanId === scan.id);
  const audioFileId =
    existingAudioFile && existingAudioFile.id
      ? existingAudioFile.id
      : deterministicArtifactId("audio", scan.id, processingRunId, audioObjectKey);
  const aiResultId = deterministicArtifactId(
    "ai",
    scan.id,
    processingRunId,
    SIGNAL_QUALITY_ANALYZER_VERSION,
  );
  const existingAiResult =
    (repositories && repositories.aiResults && typeof repositories.aiResults.findById === "function"
      ? await repositories.aiResults.findById(aiResultId)
      : null) || db.aiResults.find((item) => item.id === aiResultId);
  const quality = processed.quality;
  const audioFile = {
    ...(existingAudioFile || {}),
    id: audioFileId,
    scanId: scan.id,
    patientId,
    storageProvider: audioUpload.provider,
    objectKey: audioObjectKey,
    contentType: "audio/wav",
    byteSize: audioUpload.byteSize,
    sampleRate,
    createdAt: existingAudioFile && existingAudioFile.createdAt ? existingAudioFile.createdAt : nowIso(),
    updatedAt: nowIso(),
  };
  const aiResult = {
    ...(existingAiResult || {}),
    id: aiResultId,
    scanId: scan.id,
    modelVersion: SIGNAL_QUALITY_ANALYZER_VERSION,
    label: quality.label,
    confidence: quality.confidence,
    summary: quality.summary,
    rawResult: buildSignalQualityRawResult({
      quality,
      waveformObjectKey,
      processingGeneration,
      processingIntent,
      processingRunId,
      artifactFingerprint: contentSha256,
      workerProcessed: true,
    }),
    status: "completed",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  const sampleCount = Math.max(0, Math.floor((audioUpload.byteSize || 0) / 2));
  Object.assign(scan, {
    status: "completed",
    processingStatus: "completed",
    processingGeneration,
    processingIntent,
    processingArtifactFingerprint: contentSha256,
    processingRunId,
    organizationId,
    sampleRate,
    sampleCount,
    durationSeconds: Number((sampleCount / sampleRate).toFixed(2)),
    peak: quality.peak,
    rms: quality.rms,
    levelPercent: quality.signalLevel,
    aiLabel: aiResult.label,
    aiConfidence: aiResult.confidence,
    aiSummary: aiResult.summary,
    aiResultId: aiResult.id,
    audioFileId: audioFile.id,
    audioUrl: `/api/scans/${scan.id}/audio`,
    updatedAt: nowIso(),
  });
  await saveAudioArtifacts({
    db,
    repositories,
    saveDb: deps.saveDb,
    scan,
    audioFile,
    aiResult,
    processingGeneration,
    processingRunId,
  });
  return {
    scanId: scan.id,
    status: scan.status,
    processingStatus: scan.processingStatus,
    label: aiResult.label,
    confidence: aiResult.confidence,
    waveformPoints: processed.waveform.points.length,
    analysisKind: aiResult.rawResult.analysisKind,
    processingGeneration,
    processingRunId,
    audioObjectKey,
    waveformObjectKey,
  };
}

async function markAudioJobFailed(payload, error, deps = {}) {
  const scanId = String(payload?.scanId || "").trim();
  if (!scanId) throw new Error("scanId is required");
  const db = deps.db || {};
  const repositories = deps.repositories || null;
  const nowIso = deps.nowIso || defaultNowIso;
  const current =
    (repositories?.scans?.findById ? await repositories.scans.findById(scanId) : null) ||
    findScanById(db, scanId);
  if (!current) return { updated: false, reason: "scan_not_found" };

  const expectedGeneration = normalizeProcessingGeneration(
    payload.processingGeneration ?? current.processingGeneration,
  );
  const expectedIntent = String(payload.processingIntent ?? current.processingIntent ?? "initial")
    .trim()
    .toLowerCase() || "initial";
  const expectedFingerprint = String(payload.artifactFingerprint || "").trim().toLowerCase();
  const currentGeneration = Number(current.processingGeneration || 0);
  const currentIntent = String(current.processingIntent || "initial").trim().toLowerCase() || "initial";
  const currentFingerprint = String(current.processingArtifactFingerprint || "").trim().toLowerCase();
  if (
    (currentGeneration > 0 && currentGeneration !== expectedGeneration) ||
    currentIntent !== expectedIntent ||
    (expectedFingerprint && currentFingerprint && currentFingerprint !== expectedFingerprint)
  ) {
    return { updated: false, reason: "stale_generation" };
  }

  const failedScan = {
    ...current,
    status: "failed",
    processingStatus: "failed",
    aiLabel: "processing_failed",
    aiSummary: String(error?.message || "Audio processing failed").slice(0, 500),
    updatedAt: nowIso(),
  };
  if (repositories?.scans?.save) {
    await repositories.scans.save(failedScan);
  } else {
    db.scans = Array.isArray(db.scans) ? db.scans : [];
    syncArrayItem(db.scans, failedScan);
    if (typeof deps.saveDb === "function") await deps.saveDb(db);
  }
  return { updated: true, scan: failedScan };
}

module.exports = {
  markAudioJobFailed,
  processAudioJob,
};
