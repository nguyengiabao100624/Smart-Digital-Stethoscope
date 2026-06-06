const fs = require("node:fs");

function readPcmSamplesFromWav(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length <= 44) {
    return [];
  }
  const samples = [];
  for (let offset = 44; offset + 1 < buffer.length; offset += 2) {
    samples.push(buffer.readInt16LE(offset));
  }
  return samples;
}

function buildWaveform(samples, targetPoints = 128) {
  if (!samples.length) {
    return [];
  }
  const bucketSize = Math.max(1, Math.floor(samples.length / targetPoints));
  const points = [];
  for (let i = 0; i < samples.length; i += bucketSize) {
    const chunk = samples.slice(i, i + bucketSize);
    const peak = chunk.reduce((max, sample) => Math.max(max, Math.abs(sample)), 0);
    points.push(Number((peak / 32768).toFixed(4)));
  }
  return points.slice(0, targetPoints);
}

function qualityCheck(samples) {
  if (!samples.length) {
    return {
      label: "no_audio",
      confidence: 0,
      summary: "Không có mẫu âm thanh để phân tích.",
      rms: 0,
      peak: 0,
      clipCount: 0,
      noiseLevel: 0,
      signalLevel: 0,
    };
  }
  let sumSquares = 0;
  let peak = 0;
  let clipCount = 0;
  for (const sample of samples) {
    const abs = Math.abs(sample);
    peak = Math.max(peak, abs);
    if (abs > 32000) clipCount += 1;
    sumSquares += sample * sample;
  }
  const rms = Math.sqrt(sumSquares / samples.length);
  const signalLevel = Math.min(100, Math.round((rms / 5000) * 100));
  const noiseLevel = Math.max(0, Math.min(100, Math.round(100 - signalLevel)));
  const label = rms > 80 && clipCount < samples.length * 0.05 ? "captured" : "low_quality";
  return {
    label,
    confidence: label === "captured" ? 0.82 : 0.38,
    summary:
      label === "captured"
        ? "Âm thanh đủ điều kiện kiểm tra chất lượng tín hiệu."
        : "Tín hiệu yếu hoặc bị clipping, nên đo lại để có kết quả tốt hơn.",
    rms: Math.round(rms),
    peak,
    clipCount,
    noiseLevel,
    signalLevel,
  };
}

async function processAudioFile(input) {
  const samples = readPcmSamplesFromWav(input.filePath);
  const waveform = {
    scanId: input.scanId,
    sampleRate: input.sampleRate || 16000,
    points: buildWaveform(samples),
    generatedAt: new Date().toISOString(),
  };
  const quality = qualityCheck(samples);
  return {
    waveform,
    quality,
  };
}

module.exports = {
  processAudioFile,
};
