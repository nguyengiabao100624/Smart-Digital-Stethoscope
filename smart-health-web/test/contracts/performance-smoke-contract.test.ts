import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assertWebVitals,
  DEFAULT_WEB_VITAL_BUDGETS,
  installPerformanceVitalsObserver,
} from "../../scripts/performanceVitals.mjs";

const smokeSource = readFileSync(
  fileURLToPath(
    new URL("../../scripts/performanceSmokeTest.mjs", import.meta.url),
  ),
  "utf8",
);

class FakePerformanceObserver {
  static supportedEntryTypes = [
    "largest-contentful-paint",
    "layout-shift",
    "event",
  ];

  static observers = new Map<string, FakePerformanceObserver>();

  callback: (list: { getEntries(): Array<Record<string, unknown>> }) => void;
  records: Array<Record<string, unknown>> = [];

  constructor(
    callback: (list: { getEntries(): Array<Record<string, unknown>> }) => void,
  ) {
    this.callback = callback;
  }

  observe(options: { type: string; durationThreshold?: number }) {
    if (options.type === "event") {
      assert.equal(options.durationThreshold, 16);
    }
    FakePerformanceObserver.observers.set(options.type, this);
  }

  takeRecords() {
    const records = this.records;
    this.records = [];
    return records;
  }

  emit(entries: Array<Record<string, unknown>>) {
    this.callback({ getEntries: () => entries });
  }
}

test("collects buffered LCP, session-window CLS and interaction-grouped INP", () => {
  const originalObserver = Object.getOwnPropertyDescriptor(
    globalThis,
    "PerformanceObserver",
  );
  const originalSnapshot = Object.getOwnPropertyDescriptor(
    globalThis,
    "__shcarePerformanceVitals",
  );

  try {
    FakePerformanceObserver.observers.clear();
    Object.defineProperty(globalThis, "PerformanceObserver", {
      configurable: true,
      value: FakePerformanceObserver,
    });
    installPerformanceVitalsObserver();

    FakePerformanceObserver.observers
      .get("largest-contentful-paint")
      ?.emit([{ startTime: 700 }, { startTime: 1_250 }]);
    FakePerformanceObserver.observers.get("layout-shift")?.emit([
      { startTime: 100, value: 0.04, hadRecentInput: false },
      { startTime: 800, value: 0.03, hadRecentInput: false },
      { startTime: 2_000, value: 0.06, hadRecentInput: false },
      { startTime: 2_100, value: 0.5, hadRecentInput: true },
    ]);
    FakePerformanceObserver.observers.get("event")?.emit([
      { interactionId: 7, duration: 80 },
      { interactionId: 7, duration: 96 },
      { interactionId: 9, duration: 40 },
    ]);

    const snapshot = (
      globalThis as typeof globalThis & {
        __shcarePerformanceVitals: { snapshot(): Record<string, unknown> };
      }
    ).__shcarePerformanceVitals.snapshot();

    assert.equal(snapshot.lcpMs, 1_250);
    assert.equal(snapshot.cls, 0.07);
    assert.equal(snapshot.inpMs, 96);
    assert.equal(snapshot.interactionCount, 2);
    assert.equal(snapshot.eventEntryCount, 3);
    assert.deepEqual(snapshot.supported, {
      lcp: true,
      cls: true,
      inp: true,
    });
  } finally {
    if (originalObserver) {
      Object.defineProperty(
        globalThis,
        "PerformanceObserver",
        originalObserver,
      );
    } else {
      Reflect.deleteProperty(globalThis, "PerformanceObserver");
    }
    if (originalSnapshot) {
      Object.defineProperty(
        globalThis,
        "__shcarePerformanceVitals",
        originalSnapshot,
      );
    } else {
      Reflect.deleteProperty(globalThis, "__shcarePerformanceVitals");
    }
  }
});

test("accepts zero CLS but rejects missing samples and exceeded Web Vital budgets", () => {
  const healthy = {
    supported: { lcp: true, cls: true, inp: true },
    observerErrors: [],
    lcpMs: 2_000,
    cls: 0,
    inpMs: 120,
    lcpEntryCount: 1,
    eventEntryCount: 2,
    interactionCount: 1,
  };

  assert.doesNotThrow(() =>
    assertWebVitals("healthy", healthy, DEFAULT_WEB_VITAL_BUDGETS),
  );
  assert.throws(
    () =>
      assertWebVitals(
        "missing interaction",
        { ...healthy, inpMs: null, eventEntryCount: 0, interactionCount: 0 },
        DEFAULT_WEB_VITAL_BUDGETS,
      ),
    /mandatory INP sample was not collected/,
  );
  assert.throws(
    () =>
      assertWebVitals(
        "missing paint",
        { ...healthy, lcpMs: null, lcpEntryCount: 0 },
        DEFAULT_WEB_VITAL_BUDGETS,
      ),
    /mandatory LCP sample was not collected/,
  );
  assert.throws(
    () =>
      assertWebVitals(
        "unsupported observer",
        { ...healthy, supported: { lcp: true, cls: false, inp: true } },
        DEFAULT_WEB_VITAL_BUDGETS,
      ),
    /does not support mandatory CLS PerformanceObserver entries/,
  );
  assert.throws(
    () =>
      assertWebVitals(
        "slow paint",
        { ...healthy, lcpMs: 2_501 },
        DEFAULT_WEB_VITAL_BUDGETS,
      ),
    /LCP 2501\.0ms exceeds budget 2500ms/,
  );
  assert.throws(
    () =>
      assertWebVitals(
        "slow interaction",
        { ...healthy, inpMs: 201 },
        DEFAULT_WEB_VITAL_BUDGETS,
      ),
    /INP 201\.0ms exceeds budget 200ms/,
  );
  assert.throws(
    () =>
      assertWebVitals(
        "unstable layout",
        { ...healthy, cls: 0.1001 },
        DEFAULT_WEB_VITAL_BUDGETS,
      ),
    /CLS 0\.1001 exceeds budget 0\.1/,
  );
});

test("keeps local Public proof credential-free and installs observers before measurement", () => {
  assert.match(smokeSource, /--local-public/);
  assert.match(smokeSource, /scope:\s*publicOnly \? "public" : "full"/);
  assert.match(
    smokeSource,
    /const account = mode\.scope === "full" \? readSmokeAccount\(\) : null/,
  );
  assert.match(
    smokeSource,
    /await page\.addInitScript\(installPerformanceVitalsObserver\)/,
  );
  assert.match(smokeSource, /exerciseMeaningfulInteraction/);
  assert.match(smokeSource, /assertWebVitals\(label, measured\.webVitals/);
  assert.match(smokeSource, /local-production-preview/);
  assert.match(
    smokeSource,
    /"build", "--config", "vite\.firebase\.config\.ts"/,
  );
  assert.match(smokeSource, /resourceBudgetEnforced: true/);
  assert.match(smokeSource, /SMART_HEALTH_LCP_BUDGET_MS/);
  assert.match(smokeSource, /SMART_HEALTH_INP_BUDGET_MS/);
  assert.match(smokeSource, /SMART_HEALTH_CLS_BUDGET/);
});
