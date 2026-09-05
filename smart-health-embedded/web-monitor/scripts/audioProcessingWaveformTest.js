"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { buildWaveform } = require("../src/audioProcessing");

test("processed biomedical waveform preserves signed PCM polarity", () => {
  const points = buildWaveform(
    [0, 1000, -2000, -1000, 3000, 100, -4000, -500],
    4,
  );

  assert.deepEqual(points, [0.0305, -0.061, 0.0916, -0.1221]);
  assert.equal(points.some((point) => point > 0), true);
  assert.equal(points.some((point) => point < 0), true);
  assert.equal(points.every((point) => point >= -1 && point <= 1), true);
});

test("processed biomedical waveform stays bounded and empty input stays empty", () => {
  assert.deepEqual(buildWaveform([], 128), []);
  assert.deepEqual(buildWaveform([32767, -32768], 2), [1, -1]);
});
