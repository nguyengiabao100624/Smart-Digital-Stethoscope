const fs = require("node:fs");

const { processAudioFile } = require("./audioProcessing");
const { buildScanObjectKey, createStorageAdapter } = require("./storageAdapter");

function defaultNowIso() {
  return new Date().toISOString();
}

function defaultCreateId(prefix) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${prefix}_${stamp}_${Math.random().toString(16).slice(2, 10)}`;
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

async function saveAudioArtifacts({ db, repositories, saveDb, scan, audioFile, aiResult }) {
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
    return;
  }

  db.audioFiles = db.audioFiles || [];
  db.aiResults = db.aiResults || [];
  syncArrayItem(db.audioFiles, audioFile);
  db.aiResults.unshift(aiResult);
  db.audioFiles = db.audioFiles.slice(0, 1000);
  db.aiResults = db.aiResults.slice(0, 1000);
  if (typeof saveDb === "function") {
    await saveDb(db);
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
  const createId = deps.createId || defaultCreateId;
  let scan =
    deps.scan ||
    (repositories && repositories.scans && typeof repositories.scans.findById === "function"
      ? await repositories.scans.findById(scanId)
      : null) ||
    findScanById(db, scanId);
  if (!scan) {
    throw new Error(`Scan not found: ${scanId}`);
  }

  const storageAdapter =
    deps.storageAdapter ||
    createStorageAdapter({
      dataDir: deps.dataDir,
      env: deps.env || process.env,
    });
  const patientId = payload.patientId || scan.patientId;
  const organizationId =
    payload.organizationId ||
    scan.organizationId ||
    (typeof deps.getScanOrgId === "function" ? deps.getScanOrgId(scan) : "") ||
    "org_default_clinic";
  const sampleRate = Number(payload.sampleRate || scan.sampleRate || 16000);
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
  const quality = processed.quality;
  const audioFile = Object.assign(existingAudioFile || {}, {
    id: existingAudioFile && existingAudioFile.id ? existingAudioFile.id : createId("audio"),
    scanId: scan.id,
    patientId,
    storageProvider: audioUpload.provider,
    objectKey: audioObjectKey,
    contentType: "audio/wav",
    byteSize: audioUpload.byteSize,
    sampleRate,
    createdAt: existingAudioFile && existingAudioFile.createdAt ? existingAudioFile.createdAt : nowIso(),
    updatedAt: nowIso(),
  });
  const aiResult = {
    id: createId("ai"),
    scanId: scan.id,
    modelVersion: deps.modelVersion || (db.settings && db.settings.ai && db.settings.ai.version) || "signal-quality-demo",
    label: quality.label,
    confidence: quality.confidence,
    summary: quality.summary,
    rawResult: {
      quality,
      waveformObjectKey,
      workerProcessed: true,
    },
    status: "completed",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  const sampleCount = Math.max(0, Math.floor((audioUpload.byteSize || 0) / 2));
  Object.assign(scan, {
    status: "completed",
    processingStatus: "completed",
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
  });
  return {
    scanId: scan.id,
    status: scan.status,
    processingStatus: scan.processingStatus,
    label: aiResult.label,
    confidence: aiResult.confidence,
    waveformPoints: processed.waveform.points.length,
    audioObjectKey,
    waveformObjectKey,
  };
}

module.exports = {
  processAudioJob,
};
