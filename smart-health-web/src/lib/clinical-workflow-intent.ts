export interface ClinicalWorkflowIntent {
  fingerprint: string;
  idempotencyKey: string;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function randomIntentId() {
  return globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function resolveClinicalWorkflowIntent(
  current: ClinicalWorkflowIntent | null,
  scope: string,
  payload: Record<string, unknown>,
  createId: () => string = randomIntentId,
) {
  const fingerprint = stableSerialize(payload);
  if (current?.fingerprint === fingerprint) return current;
  return {
    fingerprint,
    idempotencyKey: `portal-${scope}-${createId()}`,
  };
}
