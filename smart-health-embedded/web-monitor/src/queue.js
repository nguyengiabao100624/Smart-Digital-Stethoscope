function isRedisEnabled(env = process.env) {
  return Boolean(env.REDIS_URL);
}

function createAudioQueue(env = process.env) {
  if (!isRedisEnabled(env)) {
    return {
      enabled: false,
      async enqueue() {
        return false;
      },
      async close() {},
    };
  }

  const { Queue } = require("bullmq");
  const connection = {
    url: env.REDIS_URL,
  };
  const queue = new Queue("audio-processing", { connection });
  return {
    enabled: true,
    async enqueue(payload) {
      await queue.add("process-scan-audio", payload, {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 100,
      });
      return true;
    },
    async close() {
      await queue.close();
    },
  };
}

module.exports = {
  createAudioQueue,
};
