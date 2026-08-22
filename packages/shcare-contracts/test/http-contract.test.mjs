import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { load as parseYaml } from "js-yaml";

const root = new URL("../", import.meta.url);

async function readJson(relativePath) {
  return JSON.parse(await readFile(new URL(relativePath, root), "utf8"));
}

async function readText(relativePath) {
  return readFile(new URL(relativePath, root), "utf8");
}

function jsonPointer(document, pointer) {
  if (!pointer || pointer === "#") return document;
  return pointer
    .replace(/^#\/?/, "")
    .split("/")
    .filter(Boolean)
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce((value, part) => value?.[part], document);
}

function matchesClosedSchema(value, schema, document, documents) {
  if (!schema || typeof schema !== "object") return true;
  if (schema.$ref) {
    const [fileName, fragment = ""] = schema.$ref.split("#", 2);
    const targetDocument = fileName ? documents.get(fileName) : document;
    const targetSchema = jsonPointer(targetDocument, fragment ? `#${fragment}` : "#");
    return Boolean(targetSchema) && matchesClosedSchema(value, targetSchema, targetDocument, documents);
  }
  if (schema.allOf && !schema.allOf.every((item) => matchesClosedSchema(value, item, document, documents))) {
    return false;
  }
  if (schema.oneOf) {
    const matches = schema.oneOf.filter((item) => matchesClosedSchema(value, item, document, documents));
    if (matches.length !== 1) return false;
  }
  if (schema.anyOf && !schema.anyOf.some((item) => matchesClosedSchema(value, item, document, documents))) {
    return false;
  }
  if (schema.not && matchesClosedSchema(value, schema.not, document, documents)) return false;
  if (schema.if) {
    const branch = matchesClosedSchema(value, schema.if, document, documents) ? schema.then : schema.else;
    if (branch && !matchesClosedSchema(value, branch, document, documents)) return false;
  }
  if (Object.hasOwn(schema, "const") && value !== schema.const) return false;
  if (schema.enum && !schema.enum.some((item) => item === value)) return false;

  const allowedTypes = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (allowedTypes.length > 0) {
    const actualType = value === null
      ? "null"
      : Array.isArray(value)
        ? "array"
        : Number.isInteger(value)
          ? "integer"
          : typeof value === "number"
            ? "number"
            : typeof value;
    if (!allowedTypes.includes(actualType) && !(actualType === "integer" && allowedTypes.includes("number"))) {
      return false;
    }
  }

  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) return false;
    if (schema.maxLength !== undefined && value.length > schema.maxLength) return false;
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) return false;
    if (schema.format === "date-time" && Number.isNaN(Date.parse(value))) return false;
    if (schema.format === "uri") {
      try {
        new URL(value);
      } catch {
        return false;
      }
    }
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) return false;
    if (schema.maximum !== undefined && value > schema.maximum) return false;
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) return false;
    if (schema.maxItems !== undefined && value.length > schema.maxItems) return false;
    if (schema.items && !value.every((item) => matchesClosedSchema(item, schema.items, document, documents))) {
      return false;
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const required = schema.required || [];
    if (!required.every((key) => Object.hasOwn(value, key))) return false;
    const properties = schema.properties || {};
    if (schema.additionalProperties === false && Object.keys(value).some((key) => !Object.hasOwn(properties, key))) {
      return false;
    }
    for (const [key, propertySchema] of Object.entries(properties)) {
      if (Object.hasOwn(value, key) && !matchesClosedSchema(value[key], propertySchema, document, documents)) {
        return false;
      }
    }
    if (schema.maxProperties !== undefined && Object.keys(value).length > schema.maxProperties) return false;
  }
  return true;
}

describe("Shcare HTTP v1 contracts", () => {
  it("publishes one exact owner-bound account profile update receipt", async () => {
    const requestSchema = await readJson(
      "http/v1/account-profile-update-request.schema.json",
    );
    const responseSchema = await readJson(
      "http/v1/account-profile-update-response.schema.json",
    );
    const request = await readJson(
      "http/v1/fixtures/account-profile-update-request.json",
    );
    const response = await readJson(
      "http/v1/fixtures/account-profile-update-response.json",
    );
    const openApi = parseYaml(
      await readText("../../smart-health-embedded/web-monitor/public/openapi.yaml"),
    );

    assert.deepEqual(requestSchema["x-shcare-http"], {
      method: "PATCH",
      path: "/v1/me",
      requiredHeaders: ["Idempotency-Key"],
    });
    assert.deepEqual(requestSchema["x-shcare-owner-binding"], {
      source: "authenticated-backend-user",
      crossAccountOutcome: 409,
      idempotencyScope: "userId",
    });
    assert.equal(requestSchema.additionalProperties, false);
    assert.deepEqual(Object.keys(request).sort(), ["address", "phone"]);
    assert.equal(Object.hasOwn(request, "userId"), false);
    assert.equal(Object.hasOwn(request, "organizationId"), false);
    assert.equal(Object.hasOwn(request, "avatarUrl"), false);
    assert.equal(Object.hasOwn(request, "notificationPreferences"), false);

    assert.equal(responseSchema.additionalProperties, false);
    assert.deepEqual(responseSchema.required, [
      "userId",
      "intent",
      "changedFields",
      "user",
      "replayed",
    ]);
    assert.deepEqual(Object.keys(response), responseSchema.required);
    assert.equal(response.userId, response.user.id);
    assert.equal(response.intent, "profile_update");
    assert.deepEqual(response.changedFields, [...response.changedFields].sort());
    assert.equal(new Set(response.changedFields).size, response.changedFields.length);
    assert.equal(response.replayed, false);
    assert.equal(responseSchema.properties.user.additionalProperties, false);
    assert.deepEqual(
      Object.keys(response.user),
      responseSchema.properties.user.required,
    );
    assert.doesNotMatch(
      JSON.stringify(response),
      /(?:password|firebaseClaims|avatarStorage|twoFactorSecret|recoveryCodes)/i,
    );

    const operation = openApi.paths["/me"].patch;
    assert.deepEqual(operation.parameters, [
      { $ref: "#/components/parameters/IdempotencyKey" },
    ]);
    assert.equal(
      operation.requestBody.content["application/json"].schema.$ref,
      "#/components/schemas/AccountProfileUpdateRequest",
    );
    assert.equal(
      operation.responses["200"].content["application/json"].schema.$ref,
      "#/components/schemas/AccountProfileUpdateReceipt",
    );
    assert.deepEqual(
      openApi.components.schemas.AccountProfileUpdateReceipt.required,
      responseSchema.required,
    );
  });

  it("publishes one owner-bound idempotent auth-session revocation receipt", async () => {
    const schema = await readJson(
      "http/v1/auth-session-revoke-response.schema.json",
    );
    const fixture = await readJson(
      "http/v1/fixtures/auth-session-revoke-response.json",
    );
    const openApi = await readText(
      "../../smart-health-embedded/web-monitor/public/openapi.yaml",
    );
    const openApiDocument = parseYaml(openApi);

    assert.deepEqual(schema["x-shcare-http"], {
      method: "POST",
      path: "/v1/auth/sessions/{sessionId}/revoke",
      requiredHeaders: ["Idempotency-Key"],
    });
    assert.deepEqual(schema["x-shcare-owner-binding"], {
      source: "authenticated-backend-user",
      crossAccountOutcome: 404,
      idempotencyScope: "userId",
    });
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required, ["session", "revoked", "replayed"]);
    assert.deepEqual(Object.keys(schema.properties), schema.required);
    assert.deepEqual(Object.keys(fixture), schema.required);
    assert.equal(schema.properties.session.additionalProperties, false);
    assert.deepEqual(schema.properties.session.required, [
      "id",
      "provider",
      "device",
      "userAgent",
      "ip",
      "createdAt",
      "lastSeenAt",
      "revokedAt",
      "current",
    ]);
    assert.deepEqual(
      Object.keys(fixture.session),
      schema.properties.session.required,
    );
    assert.equal(schema.properties.session.properties.id.maxLength, 160);
    assert.equal(schema.properties.session.properties.provider.maxLength, 80);
    assert.ok(Date.parse(fixture.session.revokedAt));
    assert.equal(fixture.session.current, false);
    assert.equal(fixture.revoked, true);
    assert.equal(fixture.replayed, false);
    assert.doesNotMatch(
      JSON.stringify(fixture),
      /(?:userId|token|secret|credential|idempotencyKey)/i,
    );

    const revokePath = openApi.slice(
      openApi.indexOf("  /auth/sessions/{sessionId}/revoke:"),
      openApi.indexOf("  /me/password:"),
    );
    assert.match(revokePath, /\$ref: "#\/components\/parameters\/IdempotencyKey"/);
    assert.match(revokePath, /\$ref: "#\/components\/schemas\/AuthSessionRevokeReceipt"/);
    assert.match(revokePath, /"404":\s+[\s\S]*ErrorResponse/);
    assert.match(revokePath, /"409":\s+[\s\S]*ErrorResponse/);
    const revokeSchema =
      openApiDocument.components.schemas.AuthSessionRevokeReceipt;
    assert.deepEqual(
      Object.keys(revokeSchema.properties.session.properties),
      schema.properties.session.required,
    );
    assert.equal(
      revokeSchema.properties.session.properties.id.maxLength,
      160,
    );
    assert.equal(
      revokeSchema.properties.session.properties.provider.maxLength,
      80,
    );
  });

  it("binds a role request to one account-owned idempotent lifecycle receipt", async () => {
    const requestSchema = await readJson(
      "http/v1/role-request-request.schema.json",
    );
    const responseSchema = await readJson(
      "http/v1/role-request-response.schema.json",
    );
    const request = await readJson(
      "http/v1/fixtures/role-request-request.json",
    );
    const response = await readJson(
      "http/v1/fixtures/role-request-response.json",
    );
    const openApi = await readText(
      "../../smart-health-embedded/web-monitor/public/openapi.yaml",
    );

    assert.deepEqual(requestSchema["x-shcare-http"], {
      method: "POST",
      path: "/v1/auth/role-request",
      requiredHeaders: ["Idempotency-Key"],
    });
    assert.equal(requestSchema.additionalProperties, false);
    assert.deepEqual(requestSchema.required || [], []);
    assert.deepEqual(requestSchema.anyOf, [
      { required: ["requestedRole"] },
      { required: ["role"] },
    ]);
    assert.equal(requestSchema.properties.role.deprecated, true);
    assert.deepEqual(requestSchema["x-shcare-workspace-binding"], {
      canonicalField: "organizationId",
      compatibilityAliases: ["clinicId", "clinic"],
      failClosed: true,
      description:
        "When organizationId is present it is authoritative, must resolve to that exact workspace, and must never fall back to a display name.",
    });
    assert.equal(requestSchema.properties.organizationId.minLength, 1);
    assert.equal(requestSchema.properties.clinicId.minLength, 1);
    assert.equal(requestSchema.properties.expectedUserId.minLength, 1);
    assert.equal(requestSchema.properties.expectedWorkspaceId.minLength, 1);
    assert.equal(
      requestSchema.properties.expectedUserId.description,
      "Optional mutation precondition. When present it must equal the authenticated backend user before any write.",
    );
    assert.equal(
      requestSchema.properties.expectedWorkspaceId.description,
      "Optional mutation precondition. When present it must equal the authenticated account's current workspace before any write.",
    );
    assert.equal(requestSchema.allOf.length, 2);
    const roleRequestInputBlock = openApi.slice(
      openApi.indexOf("    RoleRequestInput:"),
      openApi.indexOf("    RoleRequestReceipt:"),
    );
    assert.match(
      roleRequestInputBlock,
      /allOf:\s+[\s\S]*requestedRole:\s+[\s\S]*enum: \[doctor\][\s\S]*role:\s+[\s\S]*enum: \[patient\]/,
      "OpenAPI must reject requestedRole=doctor with role=patient",
    );
    assert.match(
      roleRequestInputBlock,
      /allOf:\s+[\s\S]*requestedRole:\s+[\s\S]*enum: \[patient\][\s\S]*role:\s+[\s\S]*enum: \[doctor\]/,
      "OpenAPI must reject requestedRole=patient with role=doctor",
    );
    assert.match(
      roleRequestInputBlock,
      /organizationId:\s+[\s\S]*?minLength: 1[\s\S]*?clinicId:\s+[\s\S]*?minLength: 1/,
      "OpenAPI workspace identifiers must have the same non-empty constraint as JSON Schema",
    );
    assert.match(
      roleRequestInputBlock,
      /expectedUserId:\s+[\s\S]*?minLength: 1[\s\S]*?expectedWorkspaceId:\s+[\s\S]*?minLength: 1/,
      "OpenAPI must publish account and workspace mutation preconditions",
    );
    assert.equal(Object.hasOwn(request, "userId"), false);
    assert.equal(Object.hasOwn(request, "actorUserId"), false);
    assert.equal(Object.hasOwn(request, "idempotencyKey"), false);
    assert.equal(request.expectedUserId, "user_role_request");
    assert.equal(
      request.expectedWorkspaceId,
      "workspace_personal_role_request",
    );
    assert.notEqual(
      request.expectedWorkspaceId,
      request.organizationId,
      "the mutation precondition binds the screen's current workspace, not the requested target workspace",
    );

    const receiptKeys = [
      "user",
      "roleRequest",
      "operationId",
      "replayed",
    ];
    assert.equal(responseSchema.additionalProperties, false);
    assert.deepEqual(responseSchema.required, receiptKeys);
    assert.deepEqual(Object.keys(responseSchema.properties), receiptKeys);
    assert.deepEqual(Object.keys(response), receiptKeys);
    assert.equal(response.user.id, "user_role_request");
    assert.equal(response.user.requestedRole, request.requestedRole);
    assert.equal(response.user.roleRequestStatus, "pending");
    assert.equal(response.user.role, "patient");
    assert.equal(response.user.accountType, request.accountType);
    assert.equal(response.user.workspaceType, request.workspaceType);
    assert.equal(response.roleRequest.requestedRole, request.requestedRole);
    assert.equal(response.roleRequest.status, response.user.roleRequestStatus);
    assert.equal(
      response.roleRequest.requestedAt,
      response.user.roleRequestedAt,
    );
    assert.ok(response.operationId);
    assert.equal(response.replayed, false);
    assert.doesNotMatch(
      JSON.stringify(response),
      /(?:password|credential|secret|token|firebaseClaims)/i,
    );
  });

  it("binds a role-request document upload to exact bytes and one account receipt", async () => {
    const responseSchema = await readJson(
      "http/v1/role-request-document-response.schema.json",
    );
    const response = await readJson(
      "http/v1/fixtures/role-request-document-response.json",
    );

    assert.deepEqual(responseSchema["x-shcare-http"], {
      method: "POST",
      path: "/v1/auth/role-request-document",
      requiredHeaders: ["Idempotency-Key", "X-File-Name", "Content-Type"],
      requestContentTypes: ["application/pdf", "image/jpeg", "image/png"],
      maxBytes: 10485760,
    });
    assert.equal(responseSchema.additionalProperties, false);
    assert.deepEqual(responseSchema.required, [
      "document",
      "operationId",
      "replayed",
    ]);
    assert.deepEqual(Object.keys(response), responseSchema.required);
    assert.deepEqual(responseSchema.properties.document.required, [
      "id",
      "userId",
      "organizationId",
      "name",
      "contentType",
      "byteSize",
      "sha256",
      "uploadedAt",
    ]);
    assert.deepEqual(
      Object.keys(response.document),
      responseSchema.properties.document.required,
    );
    assert.match(response.document.sha256, /^[a-f0-9]{64}$/);
    assert.ok(response.document.userId);
    assert.ok(response.document.organizationId);
    assert.ok(response.operationId);
    assert.equal(response.replayed, false);
    assert.doesNotMatch(
      JSON.stringify(response),
      /(?:objectKey|storageProvider|credential|secret|token)/i,
    );
  });

  it("changes a password only through an idempotent exact-secret request and exact owner receipt", async () => {
    const requestSchema = await readJson(
      "http/v1/password-change-request.schema.json",
    );
    const responseSchema = await readJson(
      "http/v1/password-change-response.schema.json",
    );
    const errorSchema = await readJson(
      "http/v1/password-change-error-response.schema.json",
    );
    const request = await readJson(
      "http/v1/fixtures/password-change-request.json",
    );
    const response = await readJson(
      "http/v1/fixtures/password-change-response.json",
    );
    const error = await readJson(
      "http/v1/fixtures/password-change-error-response.json",
    );

    assert.deepEqual(requestSchema["x-shcare-http"], {
      method: "POST",
      path: "/v1/me/password",
      requiredHeaders: ["Idempotency-Key"],
    });
    assert.equal(requestSchema.additionalProperties, false);
    assert.deepEqual(requestSchema.required, [
      "currentPassword",
      "newPassword",
    ]);
    assert.deepEqual(Object.keys(requestSchema.properties), [
      "currentPassword",
      "newPassword",
    ]);
    assert.deepEqual(Object.keys(request), ["currentPassword", "newPassword"]);
    assert.equal(
      requestSchema.properties.currentPassword["x-shcare-valueHandling"],
      "exact",
    );
    assert.equal(
      requestSchema.properties.newPassword["x-shcare-valueHandling"],
      "exact",
    );
    assert.equal(request.currentPassword === request.currentPassword.trim(), false);
    assert.equal(request.newPassword === request.newPassword.trim(), false);
    assert.equal(Object.hasOwn(request, "idempotencyKey"), false);

    const receiptKeys = [
      "ok",
      "user",
      "provider",
      "operationId",
      "replayed",
    ];
    assert.equal(responseSchema.additionalProperties, false);
    assert.deepEqual(responseSchema.required, receiptKeys);
    assert.deepEqual(Object.keys(responseSchema.properties), receiptKeys);
    assert.deepEqual(Object.keys(response), receiptKeys);
    assert.equal(response.ok, true);
    assert.deepEqual(Object.keys(responseSchema.properties.user.properties), [
      "id",
    ]);
    assert.deepEqual(responseSchema.properties.user.required, ["id"]);
    assert.equal(responseSchema.properties.user.additionalProperties, false);
    assert.deepEqual(Object.keys(response.user), ["id"]);
    assert.ok(response.user.id);
    assert.equal(["firebase", "demo"].includes(response.provider), true);
    assert.ok(response.operationId);
    assert.equal(response.replayed, false);
    assert.doesNotMatch(
      JSON.stringify(response),
      /(?:currentPassword|newPassword|credential|secret|token)/i,
    );

    assert.equal(errorSchema.additionalProperties, false);
    assert.deepEqual(errorSchema.required, ["code", "message", "requestId"]);
    assert.deepEqual(Object.keys(errorSchema.properties), [
      "code",
      "message",
      "fieldErrors",
      "requestId",
    ]);
    assert.deepEqual(Object.keys(error), [
      "code",
      "message",
      "fieldErrors",
      "requestId",
    ]);
    assert.equal(typeof error.fieldErrors.newPassword, "string");
    assert.doesNotMatch(
      JSON.stringify(error),
      /(?:currentPasswordValue|newPasswordValue|credential|secret|token)/i,
    );
  });

  it("binds the patient dashboard to one account workspace and active profile", async () => {
    const schema = await readJson(
      "http/v1/patient-dashboard-snapshot.schema.json",
    );
    const fixture = await readJson(
      "http/v1/fixtures/patient-dashboard-snapshot.json",
    );

    assert.equal(schema.additionalProperties, false);
    assert.equal(schema.properties.protocolVersion.const, 1);
    assert.equal(schema.properties.recentScans.maxItems, 5);
    assert.equal(schema.$defs.sections.additionalProperties, false);
    assert.equal(fixture.protocolVersion, 1);
    assert.equal(fixture.patient.id, fixture.activePatientId);
    assert.equal(fixture.patient.ownerUserId, fixture.userId);
    assert.equal(fixture.patient.organizationId, fixture.workspaceId);
    assert.equal(
      fixture.recentScans.every(
        (scan) =>
          scan.patientId === fixture.activePatientId &&
          scan.organizationId === fixture.workspaceId,
      ),
      true,
    );
    assert.equal(fixture.device.ownerUserId, fixture.userId);
    assert.equal(fixture.device.organizationId, fixture.workspaceId);
    assert.equal(fixture.device.assignedPatientId, fixture.activePatientId);
    assert.equal(fixture.device.battery, 0);
    assert.equal(fixture.device.online, true);
    assert.equal(schema.$defs.patient.additionalProperties, false);
    assert.equal(schema.$defs.scan.additionalProperties, false);
    assert.equal(schema.$defs.device.additionalProperties, false);
    assert.equal(Object.hasOwn(fixture.device, "connected"), false);
    assert.equal(Object.hasOwn(fixture.device, "wifiSsid"), false);
    assert.equal(Object.hasOwn(fixture.recentScans[0], "aiLabel"), false);
    assert.equal(Object.hasOwn(fixture.recentScans[0], "aiSummary"), false);
    assert.equal(Object.hasOwn(fixture.recentScans[0], "normal"), false);
  });

  it("keeps workspace switch authority in backend membership and caller idempotency", async () => {
    const schema = await readJson(
      "http/v1/workspace-switch-request.schema.json",
    );
    const fixture = await readJson(
      "http/v1/fixtures/workspace-switch-request.json",
    );

    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required, ["organizationId"]);
    assert.deepEqual(Object.keys(schema.properties), ["organizationId"]);
    assert.deepEqual(Object.keys(fixture), ["organizationId"]);
    assert.ok(fixture.organizationId);
    assert.equal(Object.hasOwn(fixture, "userId"), false);
    assert.equal(Object.hasOwn(fixture, "role"), false);
    assert.equal(Object.hasOwn(fixture, "capabilities"), false);
    assert.equal(Object.hasOwn(fixture, "idempotencyKey"), false);
  });

  it("binds workspace settings to one actor, workspace, version and transaction receipt", async () => {
    const requestSchema = await readJson(
      "http/v1/workspace-settings-update-request.schema.json",
    );
    const responseSchema = await readJson(
      "http/v1/workspace-settings-update-response.schema.json",
    );
    const request = await readJson(
      "http/v1/fixtures/workspace-settings-update-request.json",
    );
    const response = await readJson(
      "http/v1/fixtures/workspace-settings-update-response.json",
    );
    const openApiDocument = parseYaml(
      await readText("../../smart-health-embedded/web-monitor/public/openapi.yaml"),
    );

    assert.deepEqual(requestSchema["x-shcare-http"], {
      method: "PATCH",
      path: "/v1/portal/settings/workspace",
      requiredHeaders: ["Idempotency-Key"],
    });
    assert.equal(requestSchema.additionalProperties, false);
    assert.deepEqual(Object.keys(request), requestSchema.required);
    assert.equal(Object.hasOwn(request, "userId"), false);
    assert.equal(Object.hasOwn(request, "workspaceId"), false);
    assert.equal(Object.hasOwn(request, "idempotencyKey"), false);

    assert.equal(responseSchema.additionalProperties, false);
    assert.deepEqual(Object.keys(response), responseSchema.required);
    assert.deepEqual(
      Object.keys(response.ownership),
      responseSchema.properties.ownership.required,
    );
    assert.deepEqual(
      Object.keys(response.workspace),
      responseSchema.properties.workspace.required,
    );
    assert.equal(response.ownership.workspaceId, response.workspace.id);
    assert.equal(response.workspace.version, request.expectedVersion + 1);
    for (const field of ["name", "address", "phone", "email", "website"]) {
      assert.equal(response.workspace[field], request[field]);
    }

    const operation =
      openApiDocument.paths["/portal/settings/workspace"].patch;
    assert.ok(operation);
    assert.ok(
      operation.parameters.some(
        (parameter) => parameter.$ref === "#/components/parameters/IdempotencyKey",
      ),
    );
    assert.equal(
      operation.requestBody.content["application/json"].schema.$ref,
      "#/components/schemas/WorkspaceSettingsUpdateRequest",
    );
    assert.equal(
      operation.responses["200"].content["application/json"].schema.$ref,
      "#/components/schemas/WorkspaceSettingsUpdateReceipt",
    );
  });

  it("binds support ticket creation to one authenticated workspace owner receipt", async () => {
    const requestSchema = await readJson(
      "http/v1/support-ticket-create-request.schema.json",
    );
    const responseSchema = await readJson(
      "http/v1/support-ticket-create-response.schema.json",
    );
    const request = await readJson(
      "http/v1/fixtures/support-ticket-create-request.json",
    );
    const response = await readJson(
      "http/v1/fixtures/support-ticket-create-response.json",
    );

    assert.equal(requestSchema.additionalProperties, false);
    assert.deepEqual(requestSchema.required, ["type", "description"]);
    assert.deepEqual(Object.keys(request), ["type", "description"]);
    assert.equal(Object.hasOwn(request, "workspaceId"), false);
    assert.equal(Object.hasOwn(request, "requesterUserId"), false);
    assert.equal(responseSchema.additionalProperties, false);
    assert.deepEqual(responseSchema.required, ["ticket", "replayed"]);
    assert.equal(responseSchema.$defs.ticket.additionalProperties, false);
    assert.ok(response.ticket.id);
    assert.ok(response.ticket.workspaceId);
    assert.ok(response.ticket.requesterUserId);
    assert.equal(response.ticket.status, "open");
    assert.equal(Number.isFinite(Date.parse(response.ticket.createdAt)), true);
    assert.equal(response.replayed, false);
  });

  it("publishes an explicit AI availability state instead of sample messages", async () => {
    const schema = await readJson("http/v1/ai-chat-session.schema.json");
    const fixture = await readJson("http/v1/fixtures/ai-chat-unavailable.json");

    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required, ["messages", "availability"]);
    assert.equal(fixture.availability.available, false);
    assert.equal(fixture.availability.status, "unavailable");
    assert.ok(fixture.availability.reason);
    assert.deepEqual(fixture.messages, []);
  });

  it("requires server identities for a provider-confirmed AI timeline", async () => {
    const fixture = await readJson("http/v1/fixtures/ai-chat-confirmed.json");

    assert.equal(fixture.availability.available, true);
    assert.equal(fixture.messages.length, 2);
    assert.deepEqual(fixture.messages.map((message) => message.role), ["user", "assistant"]);
    assert.equal(fixture.messages.every((message) => message.id.startsWith("msg_server_")), true);
    assert.equal(fixture.messages.some((message) => message.id.startsWith("local_")), false);
    assert.equal(fixture.message.id, fixture.messages.at(-1).id);
    assert.ok(fixture.message.provider);
    assert.ok(fixture.message.model);
  });

  it("keeps 2FA disabled until recovery delivery is acknowledged", async () => {
    const schema = await readJson("http/v1/two-factor.schema.json");
    const unavailable = await readJson("http/v1/fixtures/two-factor-unavailable.json");
    const enrollment = await readJson("http/v1/fixtures/two-factor-enrollment.json");
    const verified = await readJson("http/v1/fixtures/two-factor-verified.json");
    const acknowledged = await readJson(
      "http/v1/fixtures/two-factor-recovery-acknowledged.json",
    );
    const openApi = parseYaml(
      await readText("../../smart-health-embedded/web-monitor/public/openapi.yaml"),
    );

    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(unavailable.availability.available, false);
    assert.deepEqual(unavailable.availability.methods, []);
    assert.equal(enrollment.twoFactor.enabled, false);
    assert.equal(enrollment.twoFactor.enrollmentPending, true);
    assert.match(enrollment.enrollment.otpauthUri, /^otpauth:\/\/totp\//);
    assert.equal(Object.hasOwn(enrollment, "recoveryCodes"), false);
    assert.equal(verified.twoFactor.enabled, false);
    assert.equal(verified.twoFactor.enrollmentPending, true);
    assert.equal(verified.userId, "user_two_factor_fixture");
    assert.equal(verified.enrollmentId, enrollment.enrollment.id);
    assert.equal(verified.recoveryCodes.length, 8);
    assert.equal(new Set(verified.recoveryCodes).size, 8);
    assert.equal(
      verified.recoveryCodes.every((code) => /^[A-F0-9]{6}-[A-F0-9]{6}$/.test(code)),
      true,
    );
    assert.equal(verified.recoveryDelivery.acknowledged, false);
    assert.equal(verified.replayed, false);
    assert.ok(verified.recoveryAckToken.length >= 32);
    assert.equal(Object.hasOwn(verified, "twoFactorToken"), false);
    assert.equal(acknowledged.userId, verified.userId);
    assert.equal(acknowledged.enrollmentId, verified.enrollmentId);
    assert.equal(acknowledged.twoFactor.enabled, true);
    assert.equal(acknowledged.twoFactor.enrollmentPending, false);
    assert.equal(acknowledged.recoveryDelivery.id, verified.recoveryDelivery.id);
    assert.equal(acknowledged.recoveryDelivery.acknowledged, true);
    assert.ok(Date.parse(acknowledged.recoveryDelivery.acknowledgedAt));
    assert.equal(Object.hasOwn(acknowledged, "recoveryCodes"), false);
    assert.ok(acknowledged.twoFactorToken.length >= 32);
    assert.ok(Date.parse(acknowledged.tokenExpiresAt));
    assert.equal(Object.hasOwn(acknowledged, "recoveryAckToken"), false);

    const verifyPath = openApi.paths["/me/2fa/verify"].post;
    const enrollmentPath = openApi.paths["/me/2fa/enroll"].post;
    const acknowledgementPath = openApi.paths["/me/2fa/recovery-codes/ack"].post;
    assert.deepEqual(enrollmentPath.parameters, [
      { $ref: "#/components/parameters/IdempotencyKey" },
    ]);
    assert.deepEqual(
      openApi.components.schemas.TwoFactorEnrollmentResponse.required,
      ["userId", "twoFactor", "enrollment", "replayed", "superseded"],
    );
    assert.equal(enrollment.userId, "user_two_factor_fixture");
    assert.equal(enrollment.replayed, false);
    assert.equal(enrollment.superseded, false);
    assert.equal(
      schema.$defs.enrollmentResponse.properties.twoFactor.$ref,
      "#/$defs/twoFactorPendingState",
    );
    assert.deepEqual(verifyPath.parameters, [
      { $ref: "#/components/parameters/IdempotencyKey" },
    ]);
    assert.deepEqual(acknowledgementPath.parameters, [
      { $ref: "#/components/parameters/IdempotencyKey" },
    ]);
    assert.equal(
      verifyPath.responses["200"].content["application/json"].schema.$ref,
      "#/components/schemas/TwoFactorVerifiedReceipt",
    );
    assert.equal(
      acknowledgementPath.responses["200"].content["application/json"].schema.$ref,
      "#/components/schemas/TwoFactorRecoveryAckReceipt",
    );
    assert.deepEqual(
      openApi.components.schemas.TwoFactorVerifiedReceipt.required,
      [
        "userId",
        "enrollmentId",
        "twoFactor",
        "recoveryCodes",
        "recoveryDelivery",
        "recoveryAckToken",
        "replayed",
      ],
    );
  });

  it("requires a bounded second-factor challenge before an authenticated session", async () => {
    const required = await readJson("http/v1/fixtures/two-factor-required.json");
    const verified = await readJson("http/v1/fixtures/two-factor-verified.json");

    assert.equal(required.code, "TWO_FACTOR_REQUIRED");
    assert.equal(required.details.method, "app");
    assert.ok(required.details.challengeId);
    assert.equal(Object.hasOwn(required, "token"), false);
    assert.equal(Object.hasOwn(required, "twoFactorToken"), false);
    const acknowledged = await readJson(
      "http/v1/fixtures/two-factor-recovery-acknowledged.json",
    );
    assert.ok(
      Date.parse(required.details.expiresAt) <
        Date.parse(acknowledged.tokenExpiresAt),
    );
  });

  it("keeps notification registration authority out of the client request body", async () => {
    const schema = await readJson(
      "http/v1/notification-device-registration-request.schema.json",
    );
    const fixture = await readJson(
      "http/v1/fixtures/notification-device-registration-request.json",
    );

    assert.equal(schema.additionalProperties, false);
    assert.equal(schema.properties.notificationProtocolVersion.minimum, 2);
    assert.deepEqual(schema.required, [
      "fcmToken",
      "platform",
      "enabled",
      "notificationProtocolVersion",
      "appVersion",
    ]);
    assert.equal(fixture.notificationProtocolVersion >= 2, true);
    assert.ok(fixture.appVersion);
    assert.equal(Object.hasOwn(fixture, "userId"), false);
    assert.equal(Object.hasOwn(fixture, "workspaceId"), false);
    assert.equal(Object.hasOwn(fixture, "organizationId"), false);
    assert.equal(Object.hasOwn(fixture, "authSessionId"), false);
  });

  it("acknowledges the exact token owner derived by the backend", async () => {
    const schema = await readJson(
      "http/v1/notification-device-registration-ack.schema.json",
    );
    const request = await readJson(
      "http/v1/fixtures/notification-device-registration-request.json",
    );
    const acknowledgement = await readJson(
      "http/v1/fixtures/notification-device-registration-ack.json",
    );
    const device = acknowledgement.device;

    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.deepEqual(schema.required, ["device"]);
    assert.equal(
      schema.$defs.deviceAcknowledgement.properties.notificationProtocolVersion.minimum,
      2,
    );
    assert.equal(device.fcmToken, request.fcmToken);
    assert.equal(device.platform, request.platform);
    assert.equal(device.notificationProtocolVersion, request.notificationProtocolVersion);
    assert.equal(device.appVersion, request.appVersion);
    assert.ok(device.id);
    assert.ok(device.userId);
    assert.ok(device.workspaceId);
    assert.ok(device.authSessionId);
    assert.equal(device.enabled, true);
    assert.equal(Object.hasOwn(device, "organizationId"), false);
  });

  it("keeps the FCM envelope minimal and binds its wake-up signal to the canonical owner", async () => {
    const schema = await readJson(
      "http/v1/notification-fcm-data-envelope.schema.json",
    );
    const acknowledgement = await readJson(
      "http/v1/fixtures/notification-device-registration-ack.json",
    );
    const envelope = await readJson(
      "http/v1/fixtures/notification-fcm-data-envelope.json",
    );
    const device = acknowledgement.device;

    assert.equal(schema.additionalProperties, false);
    assert.equal(envelope.userId, device.userId);
    assert.equal(envelope.workspaceId, device.workspaceId);
    assert.equal(envelope.organizationId, envelope.workspaceId);
    assert.equal(envelope.notificationProtocolVersion, "2");
    assert.equal(Object.hasOwn(envelope, "authSessionId"), false);
    assert.equal(Object.hasOwn(envelope, "appVersion"), false);
    assert.equal(Object.hasOwn(envelope, "appointmentId"), false);
    assert.equal(Object.hasOwn(envelope, "patientId"), false);
    assert.equal(Object.hasOwn(envelope, "deviceId"), false);
    assert.equal(Object.hasOwn(envelope, "actionPath"), false);
  });

  it("publishes only a bounded, scan-bound waveform confirmed by the backend", async () => {
    const schema = await readJson("http/v1/scan-waveform-response.schema.json");
    const fixture = await readJson("http/v1/fixtures/scan-waveform-response.json");
    const waveform = fixture.waveform;

    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required, ["waveform"]);
    assert.equal(schema.$defs.scanWaveform.additionalProperties, false);
    assert.ok(waveform.scanId);
    assert.equal(Number.isInteger(waveform.sampleRate), true);
    assert.equal(waveform.sampleRate >= 1 && waveform.sampleRate <= 192000, true);
    assert.equal(waveform.points.length >= 1 && waveform.points.length <= 512, true);
    assert.equal(
      waveform.points.every(
        (point) => Number.isFinite(point) && point >= 0 && point <= 1,
      ),
      true,
    );
    assert.equal(Number.isFinite(Date.parse(waveform.generatedAt)), true);
    assert.equal(Object.hasOwn(waveform, "objectKey"), false);
    assert.equal(Object.hasOwn(waveform, "audioUrl"), false);
  });

  it("keeps scan audio access short-lived and free of credentials or storage identity", async () => {
    const schema = await readJson("http/v1/scan-audio-access.schema.json");
    const fixture = await readJson("http/v1/fixtures/scan-audio-access-local.json");
    const serialized = JSON.stringify(fixture);

    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required, [
      "url",
      "expiresInSeconds",
      "contentType",
      "fileName",
    ]);
    assert.ok(fixture.url.startsWith("/") || fixture.url.startsWith("https://"));
    assert.equal(
      fixture.expiresInSeconds >= 1 && fixture.expiresInSeconds <= 3600,
      true,
    );
    assert.equal(fixture.contentType, "audio/wav");
    assert.match(fixture.fileName, /^[^/\\]+\.wav$/);
    assert.equal(Object.hasOwn(fixture, "objectKey"), false);
    assert.equal(Object.hasOwn(fixture, "authSessionId"), false);
    assert.equal(Object.hasOwn(fixture, "authorization"), false);
    assert.doesNotMatch(serialized, /(?:bearer|token|secret|sessionId)/i);
  });

  it("publishes only measured tenant storage and no invented device quota", async () => {
    const schema = await readJson("http/v1/storage-summary-response.schema.json");
    const fixture = await readJson("http/v1/fixtures/storage-summary-response.json");
    const storage = fixture.storage;

    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.additionalProperties, false);
    assert.equal(schema.$defs.storageSummary.additionalProperties, false);
    assert.equal(storage.autoSync, false);
    assert.equal(storage.cloudBackup, false);
    assert.equal(storage.localUsedMb, 0);
    assert.equal(storage.localTotalMb, 0);
    assert.equal(storage.cloudTotalMb, 0);
    assert.equal(storage.cacheMb, 0);
    assert.equal(storage.cloudUsedBytes >= storage.audioUsedBytes, true);
    assert.equal(storage.storageFileCount >= storage.audioFileCount, true);
    assert.equal(Number.isFinite(Date.parse(storage.updatedAt)), true);
  });

  it("binds export completion to an immutable downloadable artifact", async () => {
    const schema = await readJson("http/v1/export-create-response.schema.json");
    const fixture = await readJson("http/v1/fixtures/export-create-response.json");
    const job = fixture.export;

    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.additionalProperties, false);
    assert.equal(schema.$defs.exportJob.additionalProperties, false);
    assert.equal(job.organizationId, job.workspaceId);
    assert.equal(job.dataset, "clinical_bundle");
    assert.equal(job.status, "ready");
    assert.equal(job.rendererVersion, "shcare.export-artifact.v1");
    assert.match(job.downloadUrl, /^\/api\/v1\/exports\/download\//);
    assert.equal(job.artifactByteSize > 0, true);
    assert.match(job.artifactSha256, /^[0-9a-f]{64}$/);
    assert.equal(fixture.replayed, false);
  });

  it("limits notification preference PATCH to one account-wide field", async () => {
    const schema = await readJson(
      "http/v1/notification-preferences-patch-request.schema.json",
    );
    const fixture = await readJson(
      "http/v1/fixtures/notification-preferences-patch-request.json",
    );
    const preferenceKeys = [
      "enabled",
      "doctorRequests",
      "abnormalResults",
      "deviceOffline",
      "appointments",
      "messages",
      "aiUpdates",
      "newLogin",
    ];

    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required, ["key", "enabled"]);
    assert.deepEqual(Object.keys(schema.properties), ["key", "enabled"]);
    assert.deepEqual(schema.properties.key.enum, preferenceKeys);
    assert.equal(schema.properties.enabled.type, "boolean");
    assert.deepEqual(Object.keys(fixture), ["key", "enabled"]);
    assert.equal(preferenceKeys.includes(fixture.key), true);
    assert.equal(typeof fixture.enabled, "boolean");
    assert.equal(preferenceKeys.includes("sound"), false);
    assert.equal(preferenceKeys.includes("vibration"), false);
  });

  it("returns canonical notification settings bound only to the authenticated owner", async () => {
    const schema = await readJson(
      "http/v1/notification-preferences-response.schema.json",
    );
    const fixture = await readJson(
      "http/v1/fixtures/notification-preferences-response.json",
    );
    const preferenceKeys = [
      "enabled",
      "doctorRequests",
      "abnormalResults",
      "deviceOffline",
      "appointments",
      "messages",
      "aiUpdates",
      "newLogin",
    ];
    const responseKeys = [
      "userId",
      "workspaceId",
      "ownership",
      "preferences",
      "channels",
      "updatedAt",
      "replayed",
    ];

    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required, responseKeys);
    assert.deepEqual(Object.keys(schema.properties), responseKeys);
    assert.deepEqual(Object.keys(fixture), responseKeys);
    assert.equal(schema.$defs.ownership.additionalProperties, false);
    assert.equal(schema.$defs.preferences.additionalProperties, false);
    assert.deepEqual(schema.$defs.preferences.required, preferenceKeys);
    assert.deepEqual(Object.keys(schema.$defs.preferences.properties), preferenceKeys);
    assert.deepEqual(Object.keys(fixture.preferences), preferenceKeys);
    assert.equal(schema.$defs.channels.additionalProperties, false);
    assert.deepEqual(schema.$defs.channels.required, ["inApp", "email", "push"]);
    assert.deepEqual(Object.keys(fixture.channels), ["inApp", "email", "push"]);
    assert.equal(schema.$defs.channelAvailability.additionalProperties, false);
    assert.deepEqual(
      Object.keys(schema.$defs.channelAvailability.properties),
      ["available", "status", "reasonCode"],
    );

    for (const channel of Object.values(fixture.channels)) {
      assert.deepEqual(Object.keys(channel), ["available", "status", "reasonCode"]);
      assert.equal(typeof channel.available, "boolean");
      assert.equal(typeof channel.status, "string");
      assert.equal(typeof channel.reasonCode, "string");
    }

    assert.equal(fixture.ownership.kind, "self");
    assert.equal(fixture.ownership.userId, fixture.userId);
    assert.equal(fixture.replayed, false);
    assert.equal(Number.isFinite(Date.parse(fixture.updatedAt)), true);
    assert.equal(Object.hasOwn(fixture.preferences, "sound"), false);
    assert.equal(Object.hasOwn(fixture.preferences, "vibration"), false);
    assert.equal(Object.hasOwn(fixture, "notificationPreferences"), false);
    assert.equal(Object.hasOwn(fixture, "currentWorkspaceId"), false);
    assert.equal(Object.hasOwn(fixture, "workspace"), false);
    assert.doesNotMatch(
      JSON.stringify(fixture),
      /(?:credential|bearer|authorization|fcmToken|authSessionId|deepLink)/i,
    );
  });

  it("binds the personal notification inbox to one authenticated account and active workspace", async () => {
    const schema = await readJson(
      "http/v1/notification-inbox-response.schema.json",
    );
    const fixture = await readJson(
      "http/v1/fixtures/notification-inbox-response.json",
    );

    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required, [
      "userId",
      "workspaceId",
      "notifications",
      "updatedAt",
    ]);
    assert.equal(schema.$defs.notification.additionalProperties, false);
    assert.ok(fixture.userId);
    assert.ok(fixture.workspaceId);
    assert.ok(fixture.notifications.length > 0);
    assert.equal(
      fixture.notifications.every(
        (notification) =>
          notification.userId === fixture.userId &&
          notification.workspaceId === fixture.workspaceId &&
          (
            notification.organizationId === "" ||
            notification.organizationId === fixture.workspaceId
          ),
      ),
      true,
    );
    assert.doesNotMatch(
      JSON.stringify(fixture),
      /(?:credential|bearer|authorization|fcmToken|authSessionId|deepLink)/i,
    );
  });

  it("returns an idempotent notification mutation receipt with a canonical inbox snapshot", async () => {
    const schema = await readJson(
      "http/v1/notification-inbox-mutation-response.schema.json",
    );
    const fixture = await readJson(
      "http/v1/fixtures/notification-inbox-mutation-response.json",
    );

    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required, [
      "userId",
      "workspaceId",
      "action",
      "notification",
      "notifications",
      "affectedIds",
      "deletedId",
      "updatedAt",
      "replayed",
    ]);
    assert.equal(fixture.action, "read");
    assert.equal(fixture.notification.userId, fixture.userId);
    assert.equal(fixture.notification.workspaceId, fixture.workspaceId);
    assert.equal(fixture.notification.read, true);
    assert.deepEqual(fixture.affectedIds, [fixture.notification.id]);
    assert.equal(fixture.deletedId, null);
    assert.equal(fixture.replayed, false);
    assert.equal(
      fixture.notifications.every(
        (notification) =>
          notification.userId === fixture.userId &&
          notification.workspaceId === fixture.workspaceId,
      ),
      true,
    );
  });

  it("binds a clinical patient list to one canonical workspace", async () => {
    const schema = await readJson("http/v1/patient-list-response.schema.json");
    const fixture = await readJson("http/v1/fixtures/patient-list-response.json");

    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required, ["workspaceId", "patients"]);
    assert.equal(schema.$defs.patient.additionalProperties, false);
    assert.ok(fixture.workspaceId);
    assert.ok(fixture.patients.length > 0);
    assert.equal(
      fixture.patients.every(
        (patient) =>
          patient.id &&
          patient.name &&
          Number.isInteger(patient.scanCount) &&
          patient.scanCount >= 0,
      ),
      true,
    );
    assert.equal(Object.hasOwn(fixture, "organizationId"), false);
  });

  it("publishes exact actor and workspace-bound patient mutation receipts", async () => {
    const authoritySchema = await readJson(
      "http/v1/patient-mutation-authority.schema.json",
    );
    const authorityFixture = await readJson(
      "http/v1/fixtures/patient-mutation-authority.json",
    );
    const schema = await readJson(
      "http/v1/patient-mutation-response.schema.json",
    );
    const fixtures = {
      create: await readJson(
        "http/v1/fixtures/patient-create-response.json",
      ),
      update: await readJson(
        "http/v1/fixtures/patient-update-response.json",
      ),
      delete: await readJson(
        "http/v1/fixtures/patient-delete-response.json",
      ),
    };
    const openApi = parseYaml(
      await readText(
        "../../smart-health-embedded/web-monitor/public/openapi.yaml",
      ),
    );

    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(authoritySchema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(authoritySchema.additionalProperties, false);
    assert.deepEqual(authoritySchema.required, [
      "expectedUserId",
      "expectedWorkspaceId",
      "expectedAuthSessionId",
    ]);
    assert.deepEqual(Object.keys(authorityFixture), authoritySchema.required);
    for (const value of Object.values(authorityFixture)) {
      assert.equal(typeof value, "string");
      assert.ok(value.length >= 1 && value.length <= 160);
    }
    assert.deepEqual(authoritySchema["x-shcare-header-binding"], {
      expectedUserId: "X-Shcare-Expected-User-Id",
      expectedWorkspaceId: "X-Shcare-Expected-Workspace-Id",
      expectedAuthSessionId: "X-Shcare-Expected-Auth-Session-Id",
    });
    assert.equal(authoritySchema["x-shcare-client-local-guard"], "authSessionEpoch");
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required, [
      "userId",
      "workspaceId",
      "patientId",
      "intent",
      "replayed",
    ]);
    assert.deepEqual(
      schema.oneOf.map((branch) => branch.properties.intent.const),
      ["create", "update", "delete"],
    );
    assert.deepEqual(schema["x-shcare-owner-binding"], {
      userId: "authenticated-backend-user",
      workspaceId: "canonical-patient-workspace",
      patientId: "canonical-patient-id",
      crossWorkspaceReplayOutcome: 409,
    });
    assert.equal(schema.$defs.patient.additionalProperties, false);

    for (const [intent, fixture] of Object.entries(fixtures)) {
      const expectedKeys = intent === "delete"
        ? ["deleted", "intent", "patientId", "replayed", "userId", "workspaceId"]
        : ["intent", "patient", "patientId", "replayed", "userId", "workspaceId"];
      assert.deepEqual(Object.keys(fixture).sort(), expectedKeys);
      assert.equal(fixture.intent, intent);
      assert.ok(fixture.userId);
      assert.ok(fixture.workspaceId);
      assert.ok(fixture.patientId);
      assert.equal(typeof fixture.replayed, "boolean");
      if (intent === "delete") {
        assert.equal(fixture.deleted, true);
        assert.equal(Object.hasOwn(fixture, "patient"), false);
      } else {
        assert.equal(fixture.patient.id, fixture.patientId);
        assert.equal(fixture.patient.organizationId, fixture.workspaceId);
        assert.equal(
          [
            fixture.patient.ownerUserId,
            fixture.patient.guardianUserId,
            fixture.patient.accountUserId,
          ].includes(fixture.userId),
          true,
        );
        assert.equal(Object.hasOwn(fixture, "deleted"), false);
      }
      assert.doesNotMatch(
        JSON.stringify(fixture),
        /(?:credential|bearer|authorization|secret|token|idempotencyKey)/i,
      );
    }

    const patientCollection = openApi.paths["/patients"];
    const patientResource = openApi.paths["/patients/{patientId}"];
    assert.equal(
      patientCollection.post.responses["201"].content["application/json"].schema.$ref,
      "#/components/schemas/PatientMutationReceipt",
    );
    for (const operation of [patientCollection.post, patientResource.patch, patientResource.delete]) {
      assert.deepEqual(
        operation.parameters.map((parameter) => parameter.$ref),
        [
          "#/components/parameters/IdempotencyKey",
          "#/components/parameters/PatientExpectedUserId",
          "#/components/parameters/PatientExpectedWorkspaceId",
          "#/components/parameters/PatientExpectedAuthSessionId",
        ],
      );
    }
    assert.deepEqual(
      [
        openApi.components.parameters.PatientExpectedUserId.name,
        openApi.components.parameters.PatientExpectedWorkspaceId.name,
        openApi.components.parameters.PatientExpectedAuthSessionId.name,
      ],
      Object.values(authoritySchema["x-shcare-header-binding"]),
    );
    assert.equal(
      patientResource.patch.responses["200"].content["application/json"].schema.$ref,
      "#/components/schemas/PatientMutationReceipt",
    );
    assert.equal(
      patientResource.delete.responses["200"].content["application/json"].schema.$ref,
      "#/components/schemas/PatientMutationReceipt",
    );
    assert.deepEqual(
      openApi.components.schemas.PatientMutationReceipt.required,
      schema.required,
    );
  });

  it("publishes a workspace-bound clinical alert ledger without provider payloads", async () => {
    const schema = await readJson("http/v1/clinical-alert-list-response.schema.json");
    const fixture = await readJson(
      "http/v1/fixtures/clinical-alert-list-response.json",
    );
    const alert = fixture.alerts[0];

    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.additionalProperties, false);
    assert.equal(schema.$defs.clinicalAlert.additionalProperties, false);
    assert.equal(alert.organizationId, fixture.workspaceId);
    assert.equal(["open", "acknowledged", "resolved"].includes(alert.status), true);
    assert.equal(Number.isInteger(alert.version) && alert.version >= 1, true);
    assert.doesNotMatch(
      JSON.stringify(fixture),
      /(?:credential|bearer|authorization|fcmToken|authSessionId|deepLink)/i,
    );
  });

  it("publishes a workspace-bound clinical review queue and exact decision receipt", async () => {
    const listSchema = await readJson(
      "http/v1/clinical-review-list-response.schema.json",
    );
    const mutationSchema = await readJson(
      "http/v1/clinical-review-mutation-response.schema.json",
    );
    const list = await readJson(
      "http/v1/fixtures/clinical-review-list-response.json",
    );
    const mutation = await readJson(
      "http/v1/fixtures/clinical-review-mutation-response.json",
    );

    assert.equal(listSchema.additionalProperties, false);
    assert.deepEqual(listSchema.required, ["workspaceId", "reviews"]);
    assert.equal(listSchema.$defs.clinicalReview.additionalProperties, false);
    assert.equal(list.reviews[0].organizationId, list.workspaceId);
    assert.equal(list.reviews[0].status, "pending");
    assert.equal(list.reviews[0].version, 1);

    assert.equal(mutationSchema.additionalProperties, false);
    assert.deepEqual(mutationSchema.required, ["workspaceId", "review"]);
    assert.equal(mutation.review.organizationId, mutation.workspaceId);
    assert.equal(mutation.review.status, "reviewed");
    assert.ok(mutation.review.decision);
    assert.ok(mutation.review.reviewerUserId);
    assert.equal(Number.isFinite(Date.parse(mutation.review.reviewedAt)), true);
    assert.ok(mutation.review.version > list.reviews[0].version);
  });

  it("confirms an alert transition in the same workspace with a newer version", async () => {
    const schema = await readJson(
      "http/v1/clinical-alert-mutation-response.schema.json",
    );
    const fixture = await readJson(
      "http/v1/fixtures/clinical-alert-mutation-response.json",
    );

    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required, ["workspaceId", "alert"]);
    assert.equal(fixture.alert.organizationId, fixture.workspaceId);
    assert.equal(fixture.alert.status, "acknowledged");
    assert.equal(fixture.alert.version, 2);
    assert.ok(fixture.alert.acknowledgedByUserId);
    assert.ok(Date.parse(fixture.alert.acknowledgedAt));
  });

  it("publishes a sanitized workspace-bound Portal monitoring fallback", async () => {
    const schema = await readJson(
      "http/v1/portal-monitoring-response.schema.json",
    );
    const fixture = await readJson(
      "http/v1/fixtures/portal-monitoring-response.json",
    );

    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(
      schema.$defs.device.not.anyOf.map((entry) => entry.required[0]),
      ["secret", "deviceSecret", "secretHash", "claimCode", "claimCodeHash"],
    );
    assert.deepEqual(schema.required, [
      "generatedAt",
      "workspaceId",
      "status",
      "devices",
      "scans",
      "alerts",
    ]);
    assert.equal(fixture.status.recording, false);
    assert.equal(
      fixture.devices.every(
        (device) =>
          device.organizationId === fixture.workspaceId &&
          typeof device.online === "boolean",
      ),
      true,
    );
    assert.equal(
      fixture.scans.every(
        (scan) => scan.organizationId === fixture.workspaceId,
      ),
      true,
    );
    assert.equal(
      fixture.alerts.every(
        (item) => item.organizationId === fixture.workspaceId,
      ),
      true,
    );
    assert.doesNotMatch(
      JSON.stringify(fixture),
      /(?:deviceSecret|secretHash|claimCodeHash|authorization|bearer)/i,
    );
  });

  it("binds Portal device and patient data-access ledgers to one active workspace", async () => {
    const deviceSchema = await readJson(
      "http/v1/portal-device-list-response.schema.json",
    );
    const deviceList = await readJson(
      "http/v1/fixtures/portal-device-list-response.json",
    );
    const ledgerSchema = await readJson(
      "http/v1/patient-share-ledger-response.schema.json",
    );
    const ledger = await readJson(
      "http/v1/fixtures/patient-share-ledger-response.json",
    );
    const mutationSchema = await readJson(
      "http/v1/patient-share-mutation-response.schema.json",
    );
    const mutation = await readJson(
      "http/v1/fixtures/patient-share-mutation-response.json",
    );
    const targetsSchema = await readJson(
      "http/v1/share-targets-response.schema.json",
    );
    const targets = await readJson(
      "http/v1/fixtures/share-targets-response.json",
    );

    assert.equal(deviceSchema.additionalProperties, false);
    assert.deepEqual(deviceSchema.required, [
      "generatedAt",
      "workspaceId",
      "devices",
    ]);
    assert.equal(
      deviceList.devices.every(
        (device) =>
          device.organizationId === deviceList.workspaceId &&
          typeof device.online === "boolean",
      ),
      true,
    );
    assert.equal(deviceList.devices[0].connected, true);
    assert.equal(deviceList.devices[0].online, false);
    assert.doesNotMatch(
      JSON.stringify(deviceList),
      /(?:deviceSecret|secretHash|claimCodeHash|tokenHash|signature)/i,
    );

    assert.equal(ledgerSchema.additionalProperties, false);
    assert.deepEqual(ledgerSchema.required, [
      "generatedAt",
      "workspaceId",
      "patientId",
      "shares",
    ]);
    assert.equal(ledger.shares[0].patientId, ledger.patientId);
    assert.equal(ledger.shares[0].status, "active");
    assert.equal(ledger.shares[0].active, true);
    assert.ok(ledger.shares[0].recipient.id);
    assert.ok(ledger.shares[0].audit.grantedByUserId);

    assert.equal(mutationSchema.additionalProperties, false);
    assert.equal(mutation.workspaceId, ledger.workspaceId);
    assert.equal(mutation.patientId, ledger.patientId);
    assert.equal(mutation.share.id, ledger.shares[0].id);
    assert.equal(mutation.replayed, false);

    assert.equal(targetsSchema.additionalProperties, false);
    assert.equal(targets.workspaceId, ledger.workspaceId);
    assert.ok(targets.doctors[0].id);
    assert.ok(targets.workspaces[0].id);
  });

  it("binds device assignment to one patient and a backend-confirmed workspace receipt", async () => {
    const requestSchema = await readJson(
      "http/v1/device-assignment-request.schema.json",
    );
    const responseSchema = await readJson(
      "http/v1/device-assignment-response.schema.json",
    );
    const request = await readJson(
      "http/v1/fixtures/device-assignment-request.json",
    );
    const response = await readJson(
      "http/v1/fixtures/device-assignment-response.json",
    );

    assert.equal(requestSchema.additionalProperties, false);
    assert.deepEqual(requestSchema.required, ["assignedPatientId"]);
    assert.deepEqual(Object.keys(request), ["assignedPatientId"]);
    assert.equal(Object.hasOwn(request, "workspaceId"), false);
    assert.equal(Object.hasOwn(request, "organizationId"), false);
    assert.equal(Object.hasOwn(request, "idempotencyKey"), false);
    assert.equal(responseSchema.additionalProperties, false);
    assert.deepEqual(responseSchema.required, ["device", "replayed"]);
    assert.equal(response.device.assignedPatientId, request.assignedPatientId);
    assert.ok(response.device.id);
    assert.ok(response.device.organizationId);
    assert.equal(response.replayed, false);
  });

  it("publishes a workspace-bound manual billing summary without an online-payment claim", async () => {
    const schema = await readJson("http/v1/billing-summary-response.schema.json");
    const fixture = await readJson(
      "http/v1/fixtures/billing-summary-response.json",
    );

    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required, [
      "generatedAt",
      "workspace",
      "package",
      "subscription",
      "usage",
      "quota",
      "usageRows",
      "currentCharge",
      "billingContact",
      "invoicePolicy",
    ]);
    assert.equal(fixture.workspace.id, fixture.subscription.organizationId);
    assert.equal(fixture.invoicePolicy.mode, "manual");
    assert.equal(fixture.invoicePolicy.providerConfigured, false);
    assert.equal(
      fixture.usageRows.every(
        (row) =>
          row.used >= 0 &&
          row.limit >= 0 &&
          (row.percent === null || (row.percent >= 0 && row.percent <= 100)),
      ),
      true,
    );
  });

  it("publishes an internally consistent workspace overview without client-invented KPI values", async () => {
    const schema = await readJson("http/v1/portal-overview-response.schema.json");
    const fixture = await readJson(
      "http/v1/fixtures/portal-overview-response.json",
    );

    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required, [
      "generatedAt",
      "workspaceId",
      "range",
      "stats",
      "measureData",
      "deviceData",
      "aiJobData",
    ]);
    assert.ok(fixture.workspaceId);
    assert.ok(Date.parse(fixture.generatedAt));
    assert.ok(Date.parse(fixture.range.startAt));
    assert.ok(Date.parse(fixture.range.endAt));
    assert.equal(
      fixture.measureData.reduce((sum, point) => sum + point.count, 0),
      fixture.stats.scansCount,
    );
    assert.equal(
      fixture.deviceData.reduce((sum, item) => sum + item.value, 0),
      fixture.stats.devicesCount,
    );
    assert.equal(
      fixture.deviceData.find((item) => item.key === "online")?.value,
      fixture.stats.devicesOnline,
    );
    assert.equal(
      fixture.aiJobData.reduce((sum, item) => sum + item.value, 0),
      fixture.stats.scansCount,
    );
    assert.equal(
      fixture.aiJobData.find((item) => item.key === "failed")?.value,
      fixture.stats.aiJobsFailed,
    );
  });

  it("publishes a sanitized staff ledger bound to one canonical workspace", async () => {
    const schema = await readJson(
      "http/v1/portal-staff-response.schema.json",
    );
    const fixture = await readJson(
      "http/v1/fixtures/portal-staff-response.json",
    );
    const staffIds = new Set(fixture.staff.map((member) => member.id));

    assert.equal(schema.additionalProperties, false);
    assert.deepEqual(schema.required, [
      "workspaceId",
      "generatedAt",
      "staff",
      "doctors",
    ]);
    assert.equal(schema.$defs.staffMember.additionalProperties, false);
    assert.equal(schema.$defs.workspaceMembership.additionalProperties, false);
    assert.ok(Date.parse(fixture.generatedAt));
    assert.equal(
      fixture.staff.every(
        (member) =>
          member.workspaceMembership.userId === member.id &&
          member.workspaceMembership.workspaceId === fixture.workspaceId &&
          member.workspaceMembership.organizationId === fixture.workspaceId,
      ),
      true,
    );
    assert.equal(
      fixture.doctors.every(
        (doctor) =>
          staffIds.has(doctor.id) &&
          doctor.role === "doctor" &&
          doctor.accountStatus === "active" &&
          doctor.roleRequestStatus === "approved" &&
          doctor.workspaceMembership.role === "doctor" &&
          doctor.workspaceMembership.status === "active" &&
          doctor.workspaceMembership.operational === true,
      ),
      true,
    );
    assert.doesNotMatch(
      JSON.stringify(fixture),
      /(?:password|firebaseClaims|twoFactor|session|token|secret)/i,
    );
  });

  it("binds avatar upload and delete to exact bytes, owner, precondition and cleanup state", async () => {
    const uploadSchema = await readJson(
      "http/v1/avatar-upload-response.schema.json",
    );
    const deleteRequestSchema = await readJson(
      "http/v1/avatar-delete-request.schema.json",
    );
    const deleteResponseSchema = await readJson(
      "http/v1/avatar-delete-response.schema.json",
    );
    const upload = await readJson(
      "http/v1/fixtures/avatar-upload-response.json",
    );
    const deleteRequest = await readJson(
      "http/v1/fixtures/avatar-delete-request.json",
    );
    const deleted = await readJson(
      "http/v1/fixtures/avatar-delete-response.json",
    );
    const cleanupStatusSchema = await readJson(
      "http/v1/avatar-cleanup-status.schema.json",
    );
    const cleanupStatus = await readJson(
      "http/v1/fixtures/avatar-cleanup-status.json",
    );
    const openApi = await readText(
      "../../smart-health-embedded/web-monitor/public/openapi.yaml",
    );

    assert.deepEqual(uploadSchema["x-shcare-http"], {
      method: "POST",
      path: "/v1/me/avatar",
      requiredHeaders: ["Idempotency-Key", "X-File-Name", "Content-Type"],
      requestContentTypes: ["image/jpeg", "image/png", "image/webp"],
      maxBytes: 2097152,
      contentDigest: "sha256",
    });
    assert.equal(uploadSchema.additionalProperties, false);
    assert.deepEqual(Object.keys(upload), uploadSchema.required);
    assert.deepEqual(
      Object.keys(upload.avatar),
      uploadSchema.properties.avatar.required,
    );
    assert.equal(upload.avatar.ownerUserId, deleted.avatar.ownerUserId);
    assert.match(upload.avatar.sha256, /^[a-f0-9]{64}$/);
    assert.equal(upload.avatar.byteSize <= 2097152, true);
    assert.equal(upload.avatar.downloadUrl, "/api/v1/me/avatar");
    assert.ok(Date.parse(upload.avatar.uploadedAt));

    assert.equal(deleteRequestSchema.additionalProperties, false);
    assert.deepEqual(deleteRequestSchema.required, ["expectedAvatarFileId"]);
    assert.deepEqual(Object.keys(deleteRequest), ["expectedAvatarFileId"]);
    assert.equal(deleteRequest.expectedAvatarFileId, upload.avatar.fileId);
    assert.equal(deleteResponseSchema.additionalProperties, false);
    assert.deepEqual(Object.keys(deleted), deleteResponseSchema.required);
    assert.equal(deleted.deleted, true);
    assert.equal(deleted.avatar.fileId, deleteRequest.expectedAvatarFileId);
    assert.equal(deleted.cleanup.previousFileId, deleted.avatar.fileId);
    assert.equal(deleted.cleanup.status, "pending");
    assert.deepEqual(cleanupStatusSchema["x-shcare-http"], {
      method: "GET",
      path: "/v1/me/avatar/cleanup",
    });
    assert.deepEqual(cleanupStatusSchema["x-shcare-owner-binding"], {
      source: "authenticated-backend-user",
      workspaceSource: "canonical-membership",
      crossAccountOutcome: 403,
      crossWorkspaceOutcome: 403,
    });
    assert.deepEqual(Object.keys(cleanupStatus), cleanupStatusSchema.required);
    assert.equal(cleanupStatus.userId, upload.avatar.ownerUserId);
    assert.equal(cleanupStatus.workspaceId, "workspace_avatar_owner");
    assert.equal(cleanupStatus.status, "dead_letter");
    assert.equal(cleanupStatus.manualSupportRequired, true);
    assert.equal(cleanupStatus.attempts > 0, true);
    assert.match(cleanupStatus.lastErrorCode, /^[A-Z0-9_]+$/);
    assert.doesNotMatch(
      JSON.stringify({ upload, deleted, cleanupStatus }),
      /(?:objectKey|storageProvider|idempotencyKey|credential|secret|token)/i,
    );

    const avatarPath = openApi.slice(
      openApi.indexOf("  /me/avatar:"),
      openApi.indexOf("  /me/password:"),
    );
    assert.match(avatarPath, /AvatarUploadReceipt/);
    assert.match(avatarPath, /AvatarDeleteInput/);
    assert.match(avatarPath, /AvatarDeleteReceipt/);
    assert.match(avatarPath, /AvatarCleanupStatus/);
    assert.match(avatarPath, /IdempotencyKey/);
    assert.match(avatarPath, /image\/jpeg/);
    assert.match(avatarPath, /image\/png/);
    assert.match(avatarPath, /image\/webp/);
  });

  it("publishes factory-enrolled provisioning and authenticated-online pairing contracts", async () => {
    const provisionRequestSchema = await readJson(
      "http/v1/device-provision-request.schema.json",
    );
    const provisionResponseSchema = await readJson(
      "http/v1/device-provision-response.schema.json",
    );
    const pairRequestSchema = await readJson(
      "http/v1/device-pair-request.schema.json",
    );
    const pairResponseSchema = await readJson(
      "http/v1/device-pair-response.schema.json",
    );
    const provisionRequest = await readJson(
      "http/v1/fixtures/device-provision-request.json",
    );
    const provisionResponse = await readJson(
      "http/v1/fixtures/device-provision-response.json",
    );
    const pairRequest = await readJson(
      "http/v1/fixtures/device-pair-request.json",
    );
    const pairResponse = await readJson(
      "http/v1/fixtures/device-pair-response.json",
    );
    const openApi = parseYaml(
      await readText("../../smart-health-embedded/web-monitor/public/openapi.yaml"),
    );

    assert.deepEqual(provisionRequestSchema["x-shcare-http"], {
      method: "POST",
      path: "/v1/devices/provision-qr",
      requiredHeaders: ["Idempotency-Key"],
    });
    assert.deepEqual(provisionRequestSchema["x-shcare-device-authority"], {
      actor: "platform_admin",
      identitySource: "factory-enrollment",
      workspaceSource: "factory-record",
      crossWorkspaceOutcome: 403,
      idempotencyScope: "userId+workspaceId",
    });
    assert.equal(provisionRequestSchema.additionalProperties, false);
    assert.equal(Object.hasOwn(provisionRequestSchema.properties, "deviceSecret"), false);
    assert.equal(Object.hasOwn(provisionRequestSchema.properties, "secretHash"), false);
    assert.equal(Object.hasOwn(provisionRequestSchema.properties, "factoryCredential"), false);
    assert.equal(provisionRequest.deviceId, provisionResponse.device.id);
    assert.equal(provisionResponse.device.id, provisionResponse.claim.deviceId);
    assert.equal(
      provisionResponse.claim.deviceId,
      provisionResponse.claim.qrPayload.deviceId,
    );
    assert.equal(
      provisionResponse.claim.claimCode,
      provisionResponse.claim.qrPayload.claimCode,
    );
    assert.equal(
      provisionResponse.claim.expiresAt,
      provisionResponse.claim.qrPayload.claimExpiresAt,
    );
    assert.equal(provisionResponse.claim.qrPayload.protocolVersion, 1);
    assert.equal(provisionResponse.claim.qrPayload.setupAp.security, "WPA2_PSK");
    assert.equal(provisionResponseSchema.additionalProperties, false);
    assert.equal(
      provisionResponseSchema["x-shcare-delivery"].persistInIdempotencyLedger,
      false,
    );

    assert.deepEqual(pairRequestSchema["x-shcare-http"], {
      method: "POST",
      path: "/v1/devices/pair",
      requiredHeaders: ["Idempotency-Key"],
    });
    assert.equal(pairRequestSchema.additionalProperties, false);
    assert.equal(pairRequestSchema.required.includes("organizationId"), true);
    assert.deepEqual(Object.keys(pairRequest).sort(), [
      "claimCode",
      "connectionMethod",
      "deviceId",
      "organizationId",
    ]);
    assert.equal(pairRequest.deviceId, pairResponse.device.id);
    assert.equal(pairRequest.organizationId, pairResponse.device.organizationId);
    assert.equal(pairRequest.connectionMethod, pairResponse.device.connectionMethod);
    assert.equal(pairResponse.pairing.outcome, "accepted");
    assert.equal(pairResponse.pairing.presence, "awaiting_online");
    assert.equal(pairResponse.pairing.onlineConfirmed, false);
    assert.equal(pairResponse.pairing.authenticatedTransport, null);
    assert.equal(pairResponse.device.connected, false);
    assert.equal(pairResponse.device.online, false);
    assert.equal(pairResponseSchema.additionalProperties, false);
    assert.deepEqual(pairResponseSchema["x-shcare-success-levels"], {
      accepted: "backend-claim-committed-awaiting-authenticated-wss",
      success: "device-authenticated-online-over-wss",
    });

    assert.doesNotMatch(
      JSON.stringify({ provisionRequest, provisionResponse, pairRequest, pairResponse }),
      /(?:deviceSecret|secretHash|claimCodeHash|factoryCredential|authorization|bearer|idempotencyKey)/i,
    );

    const provisionOperation = openApi.paths["/devices/provision-qr"].post;
    assert.deepEqual(provisionOperation.parameters, [
      { $ref: "#/components/parameters/IdempotencyKey" },
    ]);
    assert.equal(
      provisionOperation.requestBody.content["application/json"].schema.$ref,
      "#/components/schemas/DeviceProvisionRequest",
    );
    assert.equal(
      provisionOperation.responses["201"].content["application/json"].schema.$ref,
      "#/components/schemas/DeviceProvisionReceipt",
    );
    const pairOperation = openApi.paths["/devices/pair"].post;
    assert.deepEqual(pairOperation.parameters, [
      { $ref: "#/components/parameters/IdempotencyKey" },
    ]);
    assert.equal(
      pairOperation.requestBody.content["application/json"].schema.$ref,
      "#/components/schemas/DevicePairRequest",
    );
    assert.equal(
      pairOperation.responses["200"].content["application/json"].schema.$ref,
      "#/components/schemas/DevicePairReceipt",
    );
    assert.equal(
      openApi.components.schemas.DevicePairRequest.required.includes("organizationId"),
      true,
    );
    assert.deepEqual(
      openApi.components.schemas.DevicePairReceipt.required,
      pairResponseSchema.required,
    );
  });

  it("publishes closed generic-command, revocation and two-phase rotation contracts", async () => {
    const schemaNames = [
      "device-operation-common.schema.json",
      "device-command-request.schema.json",
      "device-command-response.schema.json",
      "device-command-status-response.schema.json",
      "device-revoke-response.schema.json",
      "device-credential-rotation-request.schema.json",
      "device-credential-rotation-response.schema.json",
    ];
    const schemas = await Promise.all(
      schemaNames.map((name) => readJson(`http/v1/${name}`)),
    );
    const documents = new Map(schemaNames.map((name, index) => [name, schemas[index]]));
    const fixtures = {
      "device-command-request.schema.json": await readJson("http/v1/fixtures/device-command-request.json"),
      "device-command-response.schema.json": await readJson("http/v1/fixtures/device-command-response.json"),
      "device-command-status-response.schema.json": await readJson("http/v1/fixtures/device-command-status-response.json"),
      "device-revoke-response.schema.json": await readJson("http/v1/fixtures/device-revoke-response.json"),
      "device-credential-rotation-request.schema.json": await readJson("http/v1/fixtures/device-credential-rotation-request.json"),
      "device-credential-rotation-response.schema.json": await readJson("http/v1/fixtures/device-credential-rotation-response.json"),
    };
    for (const [schemaName, fixture] of Object.entries(fixtures)) {
      const schema = documents.get(schemaName);
      assert.equal(schema.additionalProperties, false, `${schemaName} must be closed`);
      assert.equal(
        matchesClosedSchema(fixture, schema, schema, documents),
        true,
        `${schemaName} fixture must satisfy the published closed schema`,
      );
    }

    const commandRequest = fixtures["device-command-request.schema.json"];
    const commandReceipt = fixtures["device-command-response.schema.json"];
    const commandStatus = fixtures["device-command-status-response.schema.json"];
    const revokeReceipt = fixtures["device-revoke-response.schema.json"];
    const rotationReceipt = fixtures["device-credential-rotation-response.schema.json"];
    const commandRequestSchema = documents.get("device-command-request.schema.json");
    assert.deepEqual(commandRequestSchema["x-shcare-http"], {
      method: "POST",
      path: "/v1/devices/{deviceId}/commands",
      requiredHeaders: ["Idempotency-Key"],
    });
    assert.deepEqual(commandRequestSchema.properties.type.enum, [
      "restart",
      "wifi.status",
      "device.lock",
    ]);
    assert.equal(JSON.stringify(commandRequestSchema).includes("password"), false);
    assert.equal(JSON.stringify(commandRequestSchema).includes('"pass"'), false);
    assert.equal(commandRequestSchema["x-shcare-wifi-provisioning-policy"].flow, "secure_setup_ap");
    assert.equal(
      commandRequestSchema["x-shcare-wifi-provisioning-policy"].failureCode,
      "DEVICE_WIFI_UPDATE_LOCAL_SETUP_REQUIRED",
    );
    assert.equal(commandRequest.type, commandReceipt.command.type);
    assert.equal(commandRequest.correlationId, commandReceipt.command.correlationId);
    assert.equal(commandReceipt.command.deviceId, commandReceipt.device.id);
    assert.equal(commandReceipt.command.organizationId, commandReceipt.device.organizationId);
    assert.deepEqual(commandReceipt.delivery, commandReceipt.command.delivery);
    assert.notEqual(commandReceipt.command.state, "applied");
    assert.equal(commandStatus.command.state, "applied");
    assert.equal(commandStatus.command.status, commandStatus.command.state);
    assert.equal(revokeReceipt.device.ownershipState, "revoked");
    assert.equal(revokeReceipt.device.status, "revoked");
    assert.equal(revokeReceipt.device.online, false);
    assert.deepEqual(rotationReceipt.device.credentialRotation, rotationReceipt.rotation);
    assert.equal(rotationReceipt.rotation.confirmed, false);
    assert.equal(rotationReceipt.confirmed, false);
    assert.equal(rotationReceipt.command.type, "device.rotate_secret");
    assert.doesNotMatch(
      JSON.stringify(fixtures),
      /(?:deviceSecret|secretHash|nextSecretHash|requestedSessionId|confirmedSessionId|idempotencyKey|wrapCiphertext|wrapTag)/i,
    );

    const openApi = parseYaml(
      await readText("../../smart-health-embedded/web-monitor/public/openapi.yaml"),
    );
    const commandOperation = openApi.paths["/devices/{deviceId}/commands"].post;
    assert.equal(
      commandOperation.requestBody.content["application/json"].schema.$ref,
      "#/components/schemas/GenericSafeDeviceCommandRequest",
    );
    assert.equal(
      commandOperation.responses["202"].content["application/json"].schema.$ref,
      "#/components/schemas/GenericDeviceCommandReceipt",
    );
    assert.match(commandOperation.description, /DEVICE_COMMAND_SPECIALIZED_ROUTE_REQUIRED/);
    const commandStatusOperation = openApi.paths["/devices/{deviceId}/commands/{commandId}"].get;
    assert.equal(
      commandStatusOperation.responses["200"].content["application/json"].schema.$ref,
      "#/components/schemas/DeviceCommandStatusResponse",
    );
    const revokeOperation = openApi.paths["/devices/{deviceId}/revoke"].post;
    const rotationOperation = openApi.paths["/devices/{deviceId}/rotate-secret"].post;
    assert.deepEqual(revokeOperation.parameters.at(-1), {
      $ref: "#/components/parameters/IdempotencyKey",
    });
    assert.equal(
      revokeOperation.responses["200"].content["application/json"].schema.$ref,
      "#/components/schemas/DeviceRevokeReceipt",
    );
    assert.equal(
      rotationOperation.requestBody.content["application/json"].schema.$ref,
      "#/components/schemas/DeviceCredentialRotationRequest",
    );
    assert.equal(
      rotationOperation.responses["202"].content["application/json"].schema.$ref,
      "#/components/schemas/DeviceCredentialRotationReceipt",
    );
    for (const operation of [commandOperation, revokeOperation, rotationOperation]) {
      for (const status of ["400", "403", "404", "409", "503"]) {
        assert.equal(operation.responses[status].$ref, "#/components/responses/ErrorResponse");
      }
    }
  });

  it("publishes a closed signed OTA request, acceptance receipt and reconciled status", async () => {
    const schemaNames = [
      "device-operation-common.schema.json",
      "device-ota-request.schema.json",
      "device-ota-response.schema.json",
      "device-ota-status-response.schema.json",
    ];
    const schemas = await Promise.all(
      schemaNames.map((name) => readJson(`http/v1/${name}`)),
    );
    const documents = new Map(schemaNames.map((name, index) => [name, schemas[index]]));
    const otaRequest = await readJson("http/v1/fixtures/device-ota-request.json");
    const otaReceipt = await readJson("http/v1/fixtures/device-ota-response.json");
    const otaStatus = await readJson("http/v1/fixtures/device-ota-status-response.json");
    const fixtureEntries = [
      ["device-ota-request.schema.json", otaRequest],
      ["device-ota-response.schema.json", otaReceipt],
      ["device-ota-status-response.schema.json", otaStatus],
    ];
    for (const [schemaName, fixture] of fixtureEntries) {
      const schema = documents.get(schemaName);
      assert.equal(schema.additionalProperties, false, `${schemaName} must be closed`);
      assert.equal(
        matchesClosedSchema(fixture, schema, schema, documents),
        true,
        `${schemaName} fixture must satisfy the published closed schema`,
      );
    }

    const requestSchema = documents.get("device-ota-request.schema.json");
    assert.deepEqual(requestSchema["x-shcare-http"], {
      method: "POST",
      path: "/v1/devices/{deviceId}/ota",
      requiredHeaders: ["Idempotency-Key"],
    });
    assert.equal(requestSchema["x-shcare-server-signing"].privateKeyExposure, "forbidden");
    assert.equal(otaRequest.hardwareTarget, otaReceipt.ota.hardwareTarget);
    assert.equal(otaRequest.partitionTarget, otaReceipt.ota.partitionTarget);
    assert.equal(otaRequest.minimumProtocolVersion, otaReceipt.ota.minimumProtocolVersion);
    assert.deepEqual(otaReceipt.device.ota, otaReceipt.ota);
    assert.equal(otaReceipt.command.id, otaReceipt.ota.commandId);
    assert.equal(otaReceipt.command.correlationId, otaReceipt.ota.correlationId);
    assert.equal(otaReceipt.command.type, "ota.update");
    assert.ok(
      Date.parse(otaReceipt.command.executionExpiresAt) > Date.parse(otaReceipt.command.expiresAt),
      "OTA execution confirmation must have a bounded deadline after delivery admission",
    );
    assert.notEqual(otaReceipt.ota.status, "confirmed");
    assert.equal(otaStatus.device.ota.status, "confirmed");
    assert.equal(otaStatus.device.firmwareVersion, otaStatus.device.ota.firmwareVersion);
    assert.equal(otaStatus.device.lastCommand.state, "applied");
    assert.doesNotMatch(
      JSON.stringify({ otaReceipt, otaStatus }),
      /(?:downloadUrl|downloadAuthorization|"url"|signature|tokenHash|privateKey|signingKey|idempotencyKey)/i,
    );

    const openApi = parseYaml(
      await readText("../../smart-health-embedded/web-monitor/public/openapi.yaml"),
    );
    const operation = openApi.paths["/devices/{deviceId}/ota"].post;
    assert.deepEqual(operation.parameters.at(-1), {
      $ref: "#/components/parameters/IdempotencyKey",
    });
    assert.equal(
      operation.requestBody.content["application/json"].schema.$ref,
      "#/components/schemas/DeviceOtaRequest",
    );
    assert.equal(
      operation.responses["202"].content["application/json"].schema.$ref,
      "#/components/schemas/DeviceOtaReceipt",
    );
    for (const status of ["400", "403", "404", "409", "503"]) {
      assert.equal(operation.responses[status].$ref, "#/components/responses/ErrorResponse");
    }
    const statusOperation = openApi.paths["/devices/{deviceId}"].get;
    assert.equal(
      statusOperation.responses["200"].content["application/json"].schema.$ref,
      "#/components/schemas/DeviceOtaStatusResponse",
    );
    const downloadOperation = openApi.paths["/devices/{deviceId}/ota/{otaId}/firmware"].get;
    assert.deepEqual(downloadOperation.security, [{ otaDownloadBearer: [] }]);
    assert.equal(
      downloadOperation.responses["200"].content["application/octet-stream"].schema.format,
      "binary",
    );
    for (const status of ["404", "409", "410", "413"]) {
      assert.equal(typeof downloadOperation.responses[status].description, "string");
    }
    assert.deepEqual(openApi.components.schemas.DeviceOtaStatus.enum, [
      "pending", "delivered", "downloading", "verifying", "rebooting",
      "rolling_back", "confirmed", "rolled_back", "failed", "expired",
    ]);
  });

  it("publishes closed workspace-bound appointment responses and an idempotent soft-delete receipt", async () => {
    const schemaNames = [
      "appointment-list-response.schema.json",
      "appointment-mutation-response.schema.json",
      "appointment-delete-response.schema.json",
    ];
    const documents = new Map(
      await Promise.all(schemaNames.map(async (name) => [name, await readJson(`http/v1/${name}`)])),
    );
    const fixtures = [
      ["appointment-list-response.schema.json", await readJson("http/v1/fixtures/appointment-list-response.json")],
      ["appointment-mutation-response.schema.json", await readJson("http/v1/fixtures/appointment-mutation-response.json")],
      ["appointment-delete-response.schema.json", await readJson("http/v1/fixtures/appointment-delete-response.json")],
    ];
    for (const [schemaName, fixture] of fixtures) {
      const schema = documents.get(schemaName);
      assert.equal(schema.additionalProperties, false);
      assert.equal(matchesClosedSchema(fixture, schema, schema, documents), true, `${schemaName} fixture must match`);
    }
    const appointment = fixtures[0][1].appointments[0];
    assert.equal(appointment.organizationId, appointment.patient.organizationId);
    assert.equal(appointment.patientId, appointment.patient.id);
    assert.equal(appointment.doctorUserId, appointment.doctor.id);
    assert.ok(Date.parse(appointment.endsAt) > Date.parse(appointment.startsAt));
    assert.doesNotMatch(JSON.stringify(appointment), /(?:deletedByUserId|createdByUserId|idempotencyKey)/i);

    const deleteSchema = documents.get("appointment-delete-response.schema.json");
    assert.deepEqual(deleteSchema["x-shcare-http"], {
      method: "DELETE",
      path: "/portal/appointments/{appointmentId}",
      requiredHeaders: ["Idempotency-Key"],
    });
    assert.deepEqual(deleteSchema["x-shcare-delete"], { mode: "soft", auditRequired: true });

    const openApi = parseYaml(await readText("../../smart-health-embedded/web-monitor/public/openapi.yaml"));
    const collection = openApi.paths["/portal/appointments"];
    const item = openApi.paths["/portal/appointments/{appointmentId}"];
    assert.equal(collection.get.responses["200"].content["application/json"].schema.$ref, "#/components/schemas/AppointmentListResponse");
    assert.equal(collection.post.responses["201"].content["application/json"].schema.$ref, "#/components/schemas/AppointmentMutationResponse");
    assert.deepEqual(item.delete.parameters.at(-1), { $ref: "#/components/parameters/IdempotencyKey" });
    assert.equal(item.delete.responses["200"].content["application/json"].schema.$ref, "#/components/schemas/AppointmentDeleteReceipt");
  });

  it("publishes one compatible server-side list contract for Platform Admin data surfaces", async () => {
    const openApi = parseYaml(await readText("../../smart-health-embedded/web-monitor/public/openapi.yaml"));
    const routes = ["/patients", "/devices", "/admin/doctors", "/admin/packages", "/admin/storage-files"];
    const sharedParameters = ["AdminListQ", "AdminListPage", "AdminListLimit", "AdminListSort"];
    const paginationHeaders = ["AdminListTotal", "AdminListPage", "AdminListLimit", "AdminListPageCount"];

    for (const parameter of sharedParameters) {
      assert.ok(openApi.components.parameters[parameter], `${parameter} must be defined`);
    }
    for (const header of paginationHeaders) {
      assert.ok(openApi.components.headers[header], `${header} must be defined`);
    }
    assert.equal(openApi.components.parameters.AdminListLimit.schema.maximum, 100);
    assert.equal(openApi.components.parameters.AdminListPage.schema.minimum, 1);

    for (const route of routes) {
      const operation = openApi.paths[route]?.get;
      assert.ok(operation, `${route} GET must be published`);
      const refs = operation.parameters.map((parameter) => parameter.$ref).filter(Boolean);
      for (const parameter of sharedParameters) {
        assert.ok(refs.includes(`#/components/parameters/${parameter}`), `${route} must accept ${parameter}`);
      }
      const headers = operation.responses["200"].headers;
      assert.equal(headers["X-Total-Count"].$ref, "#/components/headers/AdminListTotal");
      assert.equal(headers["X-Page"].$ref, "#/components/headers/AdminListPage");
      assert.equal(headers["X-Page-Limit"].$ref, "#/components/headers/AdminListLimit");
      assert.equal(headers["X-Page-Count"].$ref, "#/components/headers/AdminListPageCount");
    }
  });
});
