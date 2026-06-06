const { processAudioFile } = require("../src/audioProcessing");

async function main() {
  if (!process.env.REDIS_URL) {
    console.log("REDIS_URL is not set; audio worker is disabled.");
    return;
  }

  const { Worker } = require("bullmq");
  const worker = new Worker(
    "audio-processing",
    async (job) => {
      const payload = job.data || {};
      if (!payload.wavFilePath) {
        throw new Error("wavFilePath is required");
      }
      const result = await processAudioFile({
        filePath: payload.wavFilePath,
        scanId: payload.scanId,
        sampleRate: payload.sampleRate || 16000,
      });
      console.log(
        JSON.stringify({
          event: "audio_processed",
          scanId: payload.scanId,
          label: result.quality.label,
          confidence: result.quality.confidence,
          waveformPoints: result.waveform.points.length,
        })
      );
      return result;
    },
    {
      connection: {
        url: process.env.REDIS_URL,
      },
    }
  );

  worker.on("failed", (job, err) => {
    console.error(JSON.stringify({ event: "audio_processing_failed", jobId: job && job.id, error: err.message }));
  });

  console.log("Audio worker listening on queue audio-processing");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
