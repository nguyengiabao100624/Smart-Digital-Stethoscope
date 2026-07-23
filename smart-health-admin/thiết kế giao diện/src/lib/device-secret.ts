export const DEVICE_SECRET_MIN_BYTES = 32;
export const DEVICE_SECRET_MAX_BYTES = 95;

export function getDeviceSecretByteLength(deviceSecret: string) {
  return new TextEncoder().encode(deviceSecret).byteLength;
}

export function getDeviceSecretValidationError(deviceSecret: string): string | null {
  if (/\r|\n|\0/.test(deviceSecret)) {
    return "Secret thiết bị không được chứa ký tự xuống dòng hoặc ký tự rỗng.";
  }

  const byteLength = getDeviceSecretByteLength(deviceSecret);
  if (byteLength < DEVICE_SECRET_MIN_BYTES) {
    return `Secret thiết bị phải có ít nhất ${DEVICE_SECRET_MIN_BYTES} byte UTF-8.`;
  }
  if (byteLength > DEVICE_SECRET_MAX_BYTES) {
    return `Secret thiết bị không được vượt quá ${DEVICE_SECRET_MAX_BYTES} byte UTF-8.`;
  }
  return null;
}

export function createDeviceSecretPayload(deviceSecret: string) {
  const error = getDeviceSecretValidationError(deviceSecret);
  if (error) throw new Error(error);
  return { deviceSecret };
}
