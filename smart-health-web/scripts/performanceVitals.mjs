export const DEFAULT_WEB_VITAL_BUDGETS = Object.freeze({
  lcpMs: 2_500,
  inpMs: 200,
  cls: 0.1,
});

/**
 * Runs in the browser before application code. Keep every dependency inside
 * this function so Playwright can serialize it through addInitScript.
 */
export function installPerformanceVitalsObserver() {
  const eventDurationThresholdMs = 16;
  const supportedEntryTypes = new Set(
    globalThis.PerformanceObserver?.supportedEntryTypes || [],
  );
  const observers = [];
  const observerErrors = [];
  const largestContentfulPaintEntries = [];
  const layoutShiftEntries = [];
  const interactionDurations = new Map();
  const interactionDetails = [];
  let eventEntryCount = 0;

  function observe(type, callback, options = {}) {
    if (!supportedEntryTypes.has(type)) return;

    try {
      const observer = new PerformanceObserver((list) => {
        callback(list.getEntries());
      });
      observer.observe({ type, buffered: true, ...options });
      observers.push({ callback, observer, type });
    } catch (error) {
      observerErrors.push(`${type}: ${String(error?.message || error)}`);
    }
  }

  function recordLargestContentfulPaint(entries) {
    for (const entry of entries) {
      const startTime = Number(entry.startTime || 0);
      if (Number.isFinite(startTime) && startTime >= 0) {
        largestContentfulPaintEntries.push(startTime);
      }
    }
  }

  function recordLayoutShifts(entries) {
    for (const entry of entries) {
      if (entry.hadRecentInput) continue;
      const startTime = Number(entry.startTime || 0);
      const value = Number(entry.value || 0);
      if (
        Number.isFinite(startTime) &&
        startTime >= 0 &&
        Number.isFinite(value) &&
        value >= 0
      ) {
        layoutShiftEntries.push({ startTime, value });
      }
    }
  }

  function recordEventTiming(entries) {
    for (const entry of entries) {
      const interactionId = Number(entry.interactionId || 0);
      const duration = Number(entry.duration);
      if (!Number.isFinite(duration) || duration < 0) continue;
      eventEntryCount += 1;
      if (!Number.isFinite(interactionId) || interactionId <= 0) continue;
      interactionDetails.push({
        name: String(entry.name || "event"),
        duration,
        interactionId,
        inputDelay: Math.max(
          0,
          Number(entry.processingStart || 0) - Number(entry.startTime || 0),
        ),
        processingDuration: Math.max(
          0,
          Number(entry.processingEnd || 0) -
            Number(entry.processingStart || 0),
        ),
        presentationDelay: Math.max(
          0,
          Number(entry.startTime || 0) +
            duration -
            Number(entry.processingEnd || 0),
        ),
      });
      interactionDurations.set(
        interactionId,
        Math.max(interactionDurations.get(interactionId) || 0, duration),
      );
    }
  }

  function calculateCls() {
    const shifts = [...layoutShiftEntries].sort(
      (left, right) => left.startTime - right.startTime,
    );
    let maximumSessionValue = 0;
    let sessionValue = 0;
    let sessionStart = 0;
    let previousShiftTime = 0;

    for (const shift of shifts) {
      const belongsToCurrentSession =
        sessionValue > 0 &&
        shift.startTime - previousShiftTime < 1_000 &&
        shift.startTime - sessionStart < 5_000;

      if (belongsToCurrentSession) {
        sessionValue += shift.value;
      } else {
        sessionValue = shift.value;
        sessionStart = shift.startTime;
      }

      previousShiftTime = shift.startTime;
      maximumSessionValue = Math.max(maximumSessionValue, sessionValue);
    }

    return maximumSessionValue;
  }

  function calculateInp() {
    const durations = [...interactionDurations.values()].sort(
      (left, right) => right - left,
    );
    // PerformanceEventTiming cannot report below the browser's minimum
    // duration threshold. No entry after an exercised interaction therefore
    // means the observed INP is bounded below this threshold, not missing.
    if (durations.length === 0) return 0;

    // INP is the p98 interaction latency. For fewer than 50 observed
    // interactions this correctly resolves to the single worst interaction.
    const percentileIndex = Math.min(
      durations.length - 1,
      Math.floor(durations.length / 50),
    );
    return durations[percentileIndex];
  }

  observe("largest-contentful-paint", recordLargestContentfulPaint);
  observe("layout-shift", recordLayoutShifts);
  observe("event", recordEventTiming, {
    durationThreshold: eventDurationThresholdMs,
  });

  globalThis.__shcarePerformanceVitals = Object.freeze({
    snapshot() {
      for (const { callback, observer } of observers) {
        callback(observer.takeRecords());
      }

      return {
        supported: {
          lcp: supportedEntryTypes.has("largest-contentful-paint"),
          cls: supportedEntryTypes.has("layout-shift"),
          inp: supportedEntryTypes.has("event"),
        },
        observerErrors: [...observerErrors],
        lcpMs:
          largestContentfulPaintEntries.length > 0
            ? Math.max(...largestContentfulPaintEntries)
            : null,
        cls: calculateCls(),
        inpMs: calculateInp(),
        lcpEntryCount: largestContentfulPaintEntries.length,
        layoutShiftEntryCount: layoutShiftEntries.length,
        eventEntryCount,
        interactionCount: interactionDurations.size,
        inpUpperBoundMs:
          interactionDurations.size === 0 ? eventDurationThresholdMs : null,
        interactionDetails: [...interactionDetails]
          .sort((left, right) => right.duration - left.duration)
          .slice(0, 8),
      };
    },
  });
}

export function assertWebVitals(label, vitals, budgets) {
  if (!vitals || typeof vitals !== "object") {
    throw new Error(`${label}: Web Vitals snapshot was not installed`);
  }

  const unsupported = Object.entries(vitals.supported || {})
    .filter(([, supported]) => supported !== true)
    .map(([metric]) => metric.toUpperCase());
  if (unsupported.length > 0) {
    throw new Error(
      `${label}: browser does not support mandatory ${unsupported.join(", ")} PerformanceObserver entries`,
    );
  }

  if (vitals.observerErrors?.length) {
    throw new Error(
      `${label}: Web Vitals observer failed: ${vitals.observerErrors.join("; ")}`,
    );
  }

  if (
    !Number.isFinite(vitals.lcpMs) ||
    vitals.lcpMs < 0 ||
    vitals.lcpEntryCount < 1
  ) {
    throw new Error(`${label}: mandatory LCP sample was not collected`);
  }
  if (!Number.isFinite(vitals.cls) || vitals.cls < 0) {
    throw new Error(`${label}: mandatory CLS metric was not collected`);
  }
  if (
    !Number.isFinite(vitals.inpMs) ||
    vitals.inpMs < 0 ||
    (vitals.eventEntryCount > 0 && vitals.interactionCount < 1)
  ) {
    throw new Error(
      `${label}: mandatory INP observation was invalid after the user interaction`,
    );
  }

  if (vitals.lcpMs > budgets.lcpMs) {
    throw new Error(
      `${label}: LCP ${vitals.lcpMs.toFixed(1)}ms exceeds budget ${budgets.lcpMs}ms`,
    );
  }
  if (vitals.inpMs > budgets.inpMs) {
    throw new Error(
      `${label}: INP ${vitals.inpMs.toFixed(1)}ms exceeds budget ${budgets.inpMs}ms; ` +
        `events=${JSON.stringify(vitals.interactionDetails || [])}`,
    );
  }
  if (vitals.cls > budgets.cls) {
    throw new Error(
      `${label}: CLS ${vitals.cls.toFixed(4)} exceeds budget ${budgets.cls}`,
    );
  }
}
