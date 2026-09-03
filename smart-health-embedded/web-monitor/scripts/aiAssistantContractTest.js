"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  AI_ATTACHMENT_MAX_BYTES,
  buildAiSafetySystemMessage,
  buildAuthorizedAiContext,
  deriveConversationTitle,
  validateAiAttachment,
} = require("../src/aiAssistantContract");

test("authorized AI context rejects scans outside the visible patient set", () => {
  const result = buildAuthorizedAiContext({
    workspaceId: "org_alpha",
    generatedAt: "2026-09-03T00:00:00.000Z",
    patients: [{ id: "pat_alpha", name: "Người bệnh A" }],
    scans: [
      { id: "scan_alpha", patientId: "pat_alpha", mode: "heart", aiSummary: "Tín hiệu đủ chất lượng" },
      { id: "scan_beta", patientId: "pat_beta", mode: "lung", aiSummary: "Không được lộ" },
    ],
  });
  assert.deepEqual(result.context.scans.map((scan) => scan.id), ["scan_alpha"]);
  assert.equal(JSON.stringify(result).includes("scan_beta"), false);
  assert.equal(JSON.stringify(result).includes("Không được lộ"), false);
});

test("AI system instruction is supportive and never authorizes diagnosis", () => {
  const prompt = buildAiSafetySystemMessage({ actorRole: "doctor", context: { scans: [] } });
  assert.match(prompt, /Không chẩn đoán/);
  assert.match(prompt, /không kê đơn/);
  assert.match(prompt, /cấp cứu/);
  assert.match(prompt, /CONTEXT_JSON/);
});

test("conversation title is stable, compact and bounded", () => {
  assert.equal(deriveConversationTitle("  Hỏi về kết quả đo tim  "), "Hỏi về kết quả đo tim");
  assert.ok(deriveConversationTitle("x".repeat(300)).length <= 120);
});

test("AI attachment contract accepts clinical support files and rejects unsafe sizes/types", () => {
  assert.equal(validateAiAttachment({ name: "ket-qua.pdf", contentType: "application/pdf", byteSize: 20 }).ok, true);
  assert.equal(validateAiAttachment({ name: "..\\secret\\ket-qua.pdf", contentType: "application/pdf", byteSize: 20 }).name, "ket-qua.pdf");
  assert.equal(validateAiAttachment({ name: "payload.exe", contentType: "application/x-msdownload", byteSize: 20 }).code, "AI_ATTACHMENT_TYPE_UNSUPPORTED");
  assert.equal(validateAiAttachment({ name: "large.pdf", contentType: "application/pdf", byteSize: AI_ATTACHMENT_MAX_BYTES + 1 }).code, "AI_ATTACHMENT_SIZE_INVALID");
});

test("AI conversation migration supports personal accounts and locks tables from direct client access", () => {
  const migration = fs.readFileSync(
    path.join(__dirname, "..", "db", "migrations", "059_ai_conversations_and_attachments.sql"),
    "utf8",
  );
  assert.match(migration, /organization_id text REFERENCES organizations\(id\)/);
  assert.doesNotMatch(migration, /organization_id text NOT NULL REFERENCES organizations\(id\)/);
  assert.match(migration, /ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /ALTER TABLE ai_chat_attachments ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE ai_conversations FROM authenticated/);
  assert.match(migration, /REVOKE ALL ON TABLE ai_chat_attachments FROM authenticated/);
});
