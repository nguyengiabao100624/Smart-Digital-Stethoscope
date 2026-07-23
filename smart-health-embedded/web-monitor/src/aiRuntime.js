"use strict";

const { getAiProviderAvailability } = require("./aiProvider");

const SIGNAL_QUALITY_ANALYSIS_KIND = "signal_quality";
const SIGNAL_QUALITY_ANALYZER_VERSION = "signal_quality_rules_v1";

function normalizeAiSettings() {
  return {
    analysisKind: SIGNAL_QUALITY_ANALYSIS_KIND,
    selectedModel: SIGNAL_QUALITY_ANALYSIS_KIND,
    version: SIGNAL_QUALITY_ANALYZER_VERSION,
    analyzerVersion: SIGNAL_QUALITY_ANALYZER_VERSION,
    status: "local_signal_quality_only",
    updateSupported: false,
    clinicalDecisionSupport: false,
    accuracyMetricsAvailable: false,
    lastUpdateStatus: "unavailable",
  };
}

function buildAiRuntimeStatus(env = process.env) {
  const chatProvider = getAiProviderAvailability(env);
  return {
    scanAnalysis: {
      available: true,
      analysisKind: SIGNAL_QUALITY_ANALYSIS_KIND,
      analyzerVersion: SIGNAL_QUALITY_ANALYZER_VERSION,
      clinicalDecisionSupport: false,
    },
    chatProvider,
    modelUpdate: {
      available: false,
      reason: "not_supported",
    },
  };
}

function buildAiUpdateStatus(env = process.env) {
  const runtime = buildAiRuntimeStatus(env);
  return {
    available: false,
    currentVersion: SIGNAL_QUALITY_ANALYZER_VERSION,
    latestVersion: null,
    reason: runtime.modelUpdate.reason,
    notes: "Hệ thống chỉ kiểm tra chất lượng tín hiệu bằng bộ quy tắc cục bộ; chưa có nhà cung cấp cập nhật mô hình lâm sàng.",
    checkedAt: new Date().toISOString(),
    runtime,
  };
}

function buildSignalQualityRawResult(details = {}) {
  return {
    ...details,
    analysisKind: SIGNAL_QUALITY_ANALYSIS_KIND,
    analyzerVersion: SIGNAL_QUALITY_ANALYZER_VERSION,
    clinicalDecisionSupport: false,
  };
}

module.exports = {
  SIGNAL_QUALITY_ANALYSIS_KIND,
  SIGNAL_QUALITY_ANALYZER_VERSION,
  buildAiRuntimeStatus,
  buildAiUpdateStatus,
  buildSignalQualityRawResult,
  normalizeAiSettings,
};
