import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertAvatarFile,
  createAvatarIdempotencyKey,
  hashAvatarFile,
  parseAvatarCleanupStatus,
  parseAvatarDeleteReceipt,
  parseAvatarUploadReceipt,
  type AvatarDeleteIntent,
  type AvatarUploadIntent,
} from "../../src/lib/avatar-operations";
import { smartHealthApi } from "../../src/lib/smart-health-api";

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
]);

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function avatarAuthority() {
  return {
    userId: "user-1",
    workspaceId: "workspace-1",
    authSessionId: "auth-session-e1",
    authSessionEpoch: smartHealthApi.getAuthSessionEpochSnapshot(),
    bearerToken: smartHealthApi.getTokenSnapshot(),
  };
}

function uploadReceipt(intent: AvatarUploadIntent) {
  return {
    avatar: {
      fileId: "file-avatar-1",
      ownerUserId: intent.userId,
      name: intent.fileName,
      contentType: intent.contentType,
      byteSize: intent.byteSize,
      sha256: intent.sha256,
      downloadUrl: "/api/v1/me/avatar",
      uploadedAt: "2026-08-09T09:00:00.000Z",
    },
    cleanup: { status: "completed", previousFileId: "file-avatar-old" },
    operationId: "avatar_upload_operation_1",
    replayed: false,
  };
}

function deleteReceipt(intent: AvatarDeleteIntent) {
  return {
    deleted: true,
    avatar: {
      fileId: intent.expectedAvatarFileId,
      ownerUserId: intent.userId,
      deletedAt: "2026-08-09T09:05:00.000Z",
    },
    cleanup: {
      status: "pending",
      previousFileId: intent.expectedAvatarFileId,
    },
    operationId: "avatar_delete_operation_1",
    replayed: false,
  };
}

describe("account avatar mutation contract", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("smart_health_token", "avatar-token");
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("hashes exact bytes and uploads through canonical v1 with a caller-owned key", async () => {
    const file = new File([PNG_BYTES], "avatar.png", { type: "image/png" });
    assertAvatarFile(file);
    const sha256 = await hashAvatarFile(file);
    const intent: AvatarUploadIntent = {
      ...avatarAuthority(),
      fileName: file.name,
      contentType: file.type,
      byteSize: file.size,
      sha256,
      idempotencyKey: "avatar-upload-key-1",
    };
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(uploadReceipt(intent), 201),
    );

    const response = await smartHealthApi.uploadMyAvatar(file, intent);
    expect(parseAvatarUploadReceipt(response, intent, intent.userId)).toEqual(
      uploadReceipt(intent),
    );

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(String(url)).toBe("http://localhost:3000/api/v1/me/avatar");
    expect(init?.method).toBe("POST");
    expect(headers.get("Idempotency-Key")).toBe(intent.idempotencyKey);
    expect(headers.get("X-Shcare-Expected-User-Id")).toBe(intent.userId);
    expect(headers.get("X-Shcare-Expected-Workspace-Id")).toBe(
      intent.workspaceId,
    );
    expect(headers.get("X-Shcare-Expected-Auth-Session-Id")).toBe(
      intent.authSessionId,
    );
    expect(headers.get("X-File-Name")).toBe(file.name);
    expect(headers.get("Content-Type")).toBe(file.type);
    expect(init?.body).toBe(file);
  });

  it("deletes only the expected active avatar through canonical v1", async () => {
    const intent: AvatarDeleteIntent = {
      ...avatarAuthority(),
      expectedAvatarFileId: "file-avatar-1",
      idempotencyKey: "avatar-delete-key-1",
    };
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(deleteReceipt(intent)));

    const response = await smartHealthApi.deleteMyAvatar(intent);
    expect(parseAvatarDeleteReceipt(response, intent, intent.userId)).toEqual(
      deleteReceipt(intent),
    );

    const [url, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(url)).toBe("http://localhost:3000/api/v1/me/avatar");
    expect(init?.method).toBe("DELETE");
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
      intent.idempotencyKey,
    );
    expect(
      new Headers(init?.headers).get("X-Shcare-Expected-Auth-Session-Id"),
    ).toBe(intent.authSessionId);
    expect(JSON.parse(String(init?.body))).toEqual({
      expectedAvatarFileId: intent.expectedAvatarFileId,
    });
  });

  it("hydrates an owner-bound dead-letter cleanup state without leaking another account", async () => {
    const payload = {
      userId: "user-1",
      workspaceId: "workspace-1",
      status: "dead_letter",
      operationId: "avatar-delete-operation-1",
      action: "delete",
      previousFileId: "file-avatar-1",
      attempts: 8,
      lastErrorCode: "PROVIDER_UNAVAILABLE",
      updatedAt: "2026-08-09T09:10:00.000Z",
      manualSupportRequired: true,
    };
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(payload));

    const response = await smartHealthApi.getMyAvatarCleanupStatus();
    expect(
      parseAvatarCleanupStatus(response, "user-1", "workspace-1"),
    ).toEqual(payload);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe(
      "http://localhost:3000/api/v1/me/avatar/cleanup",
    );
    expect(() =>
      parseAvatarCleanupStatus(payload, "user-other", "workspace-1"),
    ).toThrow(
      /không thuộc tài khoản\/workspace hiện tại/i,
    );
    expect(() =>
      parseAvatarCleanupStatus(payload, "user-1", "workspace-other"),
    ).toThrow(/không thuộc tài khoản\/workspace hiện tại/i);
    expect(() =>
      parseAvatarCleanupStatus(
        { ...payload, manualSupportRequired: false },
        "user-1",
        "workspace-1",
      ),
    ).toThrow(/chưa đủ bằng chứng/i);
  });

  it("fails closed for cross-account, hash, active-file and extra-field receipts", async () => {
    const file = new File([PNG_BYTES], "avatar.png", { type: "image/png" });
    const uploadIntent: AvatarUploadIntent = {
      ...avatarAuthority(),
      fileName: file.name,
      contentType: file.type,
      byteSize: file.size,
      sha256: await hashAvatarFile(file),
      idempotencyKey: "avatar-upload-key-1",
    };
    expect(() =>
      parseAvatarUploadReceipt(
        {
          ...uploadReceipt(uploadIntent),
          avatar: {
            ...uploadReceipt(uploadIntent).avatar,
            ownerUserId: "user-other",
          },
        },
        uploadIntent,
        uploadIntent.userId,
      ),
    ).toThrow(/tài khoản hiện tại/i);
    expect(() =>
      parseAvatarUploadReceipt(
        {
          ...uploadReceipt(uploadIntent),
          avatar: {
            ...uploadReceipt(uploadIntent).avatar,
            sha256: "b".repeat(64),
          },
        },
        uploadIntent,
        uploadIntent.userId,
      ),
    ).toThrow(/biên nhận ảnh đại diện/i);
    expect(() =>
      parseAvatarUploadReceipt(
        { ...uploadReceipt(uploadIntent), success: true },
        uploadIntent,
        uploadIntent.userId,
      ),
    ).toThrow(/biên nhận ảnh đại diện/i);

    const deleteIntent: AvatarDeleteIntent = {
      ...avatarAuthority(),
      expectedAvatarFileId: "file-avatar-1",
      idempotencyKey: "avatar-delete-key-1",
    };
    expect(() =>
      parseAvatarDeleteReceipt(
        {
          ...deleteReceipt(deleteIntent),
          avatar: {
            ...deleteReceipt(deleteIntent).avatar,
            fileId: "newer-file",
          },
        },
        deleteIntent,
        deleteIntent.userId,
      ),
    ).toThrow(/biên nhận xoá ảnh/i);
  });

  it("rejects broad image MIME and oversized files before the request", () => {
    expect(() =>
      assertAvatarFile(
        new File([PNG_BYTES], "avatar.gif", { type: "image/gif" }),
      ),
    ).toThrow(/JPEG, PNG hoặc WebP/i);
    expect(() =>
      assertAvatarFile(
        new File([new Uint8Array(2 * 1024 * 1024 + 1)], "large.png", {
          type: "image/png",
        }),
      ),
    ).toThrow(/2 MB/i);
  });

  it("creates opaque bounded upload and delete operation keys", () => {
    for (const action of ["upload", "delete"] as const) {
      const key = createAvatarIdempotencyKey(action);
      expect(key).toMatch(new RegExp(`^avatar-${action}-`));
      expect(key.length).toBeLessThanOrEqual(160);
      expect(key).not.toContain("user-1");
    }
  });

  it("resolves one exact active backend session and binds it to the bearer epoch", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({
        sessions: [
          {
            id: "auth-session-e1",
            current: true,
            revokedAt: "",
          },
        ],
      }),
    );

    const authority = await smartHealthApi.resolveAvatarMutationAuthority(
      "user-1",
      "workspace-1",
    );

    expect(authority).toEqual({
      userId: "user-1",
      workspaceId: "workspace-1",
      authSessionId: "auth-session-e1",
      authSessionEpoch: smartHealthApi.getAuthSessionEpochSnapshot(),
      bearerToken: "avatar-token",
    });
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toBe(
      "http://localhost:3000/api/v1/auth/sessions",
    );
  });

  it("rejects a session-list result that settles after its bearer was replaced", async () => {
    let settle: ((response: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          settle = resolve;
        }),
    );

    const pending = smartHealthApi.resolveAvatarMutationAuthority(
      "user-1",
      "workspace-1",
    );
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    window.localStorage.setItem("smart_health_token", "avatar-token-e2");
    settle?.(
      jsonResponse({
        sessions: [
          {
            id: "auth-session-e1",
            current: true,
            revokedAt: "",
          },
        ],
      }),
    );

    await expect(pending).rejects.toMatchObject({
      code: "AUTH_SESSION_REPLACED",
      status: 409,
    });
  });

  it("quarantines a session-list rejection that arrives after its bearer was replaced", async () => {
    let settle: ((response: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          settle = resolve;
        }),
    );

    const pending = smartHealthApi.resolveAvatarMutationAuthority(
      "user-1",
      "workspace-1",
    );
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    window.localStorage.setItem("smart_health_token", "avatar-token-e2");
    settle?.(
      jsonResponse(
        { code: "SESSION_PROVIDER_UNAVAILABLE", message: "late E1 503" },
        503,
      ),
    );

    await expect(pending).rejects.toMatchObject({
      code: "AUTH_SESSION_REPLACED",
      status: 409,
    });
  });

  it("rejects a stalled E1 upload receipt after the same user enters E2", async () => {
    const file = new File([PNG_BYTES], "avatar.png", { type: "image/png" });
    const intent: AvatarUploadIntent = {
      ...avatarAuthority(),
      fileName: file.name,
      contentType: file.type,
      byteSize: file.size,
      sha256: await hashAvatarFile(file),
      idempotencyKey: "avatar-upload-session-e1",
    };
    let settle: ((response: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          settle = resolve;
        }),
    );

    const pending = smartHealthApi.uploadMyAvatar(file, intent);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    window.localStorage.setItem("smart_health_token", "avatar-token-e2");
    expect(smartHealthApi.getAuthSessionEpochSnapshot()).not.toBe(
      intent.authSessionEpoch,
    );
    settle?.(jsonResponse(uploadReceipt(intent), 201));

    await expect(pending).rejects.toMatchObject({
      code: "AUTH_SESSION_REPLACED",
      status: 409,
    });
  });

  it("quarantines a stalled E1 upload rejection after the same user enters E2", async () => {
    const file = new File([PNG_BYTES], "avatar.png", { type: "image/png" });
    const intent: AvatarUploadIntent = {
      ...avatarAuthority(),
      fileName: file.name,
      contentType: file.type,
      byteSize: file.size,
      sha256: await hashAvatarFile(file),
      idempotencyKey: "avatar-upload-rejection-e1",
    };
    let settle: ((response: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          settle = resolve;
        }),
    );

    const pending = smartHealthApi.uploadMyAvatar(file, intent);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    window.localStorage.setItem("smart_health_token", "avatar-token-e2");
    settle?.(
      jsonResponse(
        { code: "STORAGE_PROVIDER_UNAVAILABLE", message: "late E1 503" },
        503,
      ),
    );

    await expect(pending).rejects.toMatchObject({
      code: "AUTH_SESSION_REPLACED",
      status: 409,
    });
  });

  it("quarantines a stalled E1 delete rejection after the same user enters E2", async () => {
    const intent: AvatarDeleteIntent = {
      ...avatarAuthority(),
      expectedAvatarFileId: "file-avatar-1",
      idempotencyKey: "avatar-delete-rejection-e1",
    };
    let settle: ((response: Response) => void) | undefined;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          settle = resolve;
        }),
    );

    const pending = smartHealthApi.deleteMyAvatar(intent);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    window.localStorage.setItem("smart_health_token", "avatar-token-e2");
    settle?.(
      jsonResponse(
        { code: "STORAGE_PROVIDER_UNAVAILABLE", message: "late E1 503" },
        503,
      ),
    );

    await expect(pending).rejects.toMatchObject({
      code: "AUTH_SESSION_REPLACED",
      status: 409,
    });
  });

  it("preserves a provider rejection while the exact avatar authority remains current", async () => {
    const file = new File([PNG_BYTES], "avatar.png", { type: "image/png" });
    const intent: AvatarUploadIntent = {
      ...avatarAuthority(),
      fileName: file.name,
      contentType: file.type,
      byteSize: file.size,
      sha256: await hashAvatarFile(file),
      idempotencyKey: "avatar-upload-current-provider-error",
    };
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(
        { code: "STORAGE_PROVIDER_UNAVAILABLE", message: "current E1 503" },
        503,
      ),
    );

    await expect(smartHealthApi.uploadMyAvatar(file, intent)).rejects.toMatchObject({
      code: "STORAGE_PROVIDER_UNAVAILABLE",
      status: 503,
    });
  });
});
