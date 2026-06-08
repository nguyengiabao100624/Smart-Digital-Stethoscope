const EXACT_ERROR_MESSAGES: Record<string, string> = {
  "Demo password auth is disabled in production mode":
    "Đăng nhập demo bằng mật khẩu đã bị tắt trong môi trường production. Vui lòng đăng nhập bằng tài khoản Firebase.",
  "Invalid Firebase ID token":
    "Phiên đăng nhập Firebase không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.",
  "Firebase token is missing uid": "Token Firebase thiếu UID người dùng. Vui lòng đăng nhập lại.",
  "Missing bearer token": "Thiếu token đăng nhập. Vui lòng đăng nhập lại.",
  "Invalid or expired session":
    "Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.",
  "Internal server error": "Backend Smart Health đang gặp lỗi nội bộ. Vui lòng kiểm tra log backend.",
  "Request body is too large": "Dữ liệu gửi lên quá lớn.",
  "Request body must be valid JSON": "Dữ liệu gửi lên không đúng định dạng JSON.",
  "Auth route not found": "Không tìm thấy API xác thực trên backend.",
  "Me route not found": "Không tìm thấy API hồ sơ tài khoản.",
  "Settings route not found": "Không tìm thấy API cài đặt hệ thống.",
  "Notification route not found": "Không tìm thấy API thông báo.",
  "Access log route not found": "Không tìm thấy API audit log.",
  "Device route not found": "Không tìm thấy API thiết bị.",
  "AI route not found": "Không tìm thấy API AI.",
  "Export route not found": "Không tìm thấy API xuất dữ liệu.",
  "Data route not found": "Không tìm thấy API dữ liệu.",
  "Patient route not found": "Không tìm thấy API bệnh nhân.",
  "Doctor route not found": "Không tìm thấy API bác sĩ.",
  "API route not found": "Không tìm thấy API trên backend.",
  "Requested role is not supported": "Vai trò yêu cầu chưa được hỗ trợ.",
  "Session not found": "Không tìm thấy phiên đăng nhập cần thu hồi.",
};

const FIREBASE_AUTH_MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Email hoặc mật khẩu không đúng.",
  "auth/wrong-password": "Email hoặc mật khẩu không đúng.",
  "auth/user-not-found": "Email hoặc mật khẩu không đúng.",
  "auth/invalid-email": "Email không đúng định dạng.",
  "auth/missing-email": "Vui lòng nhập email.",
  "auth/user-disabled": "Tài khoản này đã bị vô hiệu hóa.",
  "auth/too-many-requests": "Bạn thao tác quá nhiều lần. Vui lòng thử lại sau.",
  "auth/network-request-failed": "Không thể kết nối Firebase Auth. Vui lòng kiểm tra mạng.",
  "auth/popup-closed-by-user": "Bạn đã đóng cửa sổ đăng nhập trước khi hoàn tất.",
  "auth/cancelled-popup-request": "Yêu cầu đăng nhập trước đó đã bị hủy.",
  "auth/email-already-in-use": "Email này đã được sử dụng.",
  "auth/weak-password": "Mật khẩu quá yếu. Vui lòng dùng mật khẩu mạnh hơn.",
  "auth/requires-recent-login": "Phiên xác thực đã cũ. Vui lòng đăng nhập lại rồi đổi mật khẩu.",
  "auth/operation-not-allowed": "Firebase Auth chưa bật phương thức Email/Password.",
  "auth/unauthorized-domain":
    "Domain web admin chưa được cho phép trong Firebase Auth. Vào Firebase Console > Authentication > Settings > Authorized domains và thêm shcare-admin.web.app.",
  "auth/unauthorized-continue-uri":
    "Đường dẫn quay lại của email đặt lại mật khẩu chưa được Firebase cho phép. Hãy thêm domain web admin vào Authorized domains trong Firebase Authentication.",
  "auth/expired-action-code": "Link đặt lại mật khẩu đã hết hạn. Vui lòng yêu cầu gửi lại link mới.",
  "auth/invalid-action-code": "Link đặt lại mật khẩu không hợp lệ hoặc đã được sử dụng.",
};

const PARTIAL_ERROR_MESSAGES: Array<[string, string]> = [
  [
    "demo password auth is disabled in production mode",
    "Đăng nhập demo bằng mật khẩu đã bị tắt trong môi trường production. Vui lòng đăng nhập bằng tài khoản Firebase.",
  ],
  [
    "failed to fetch",
    "Không thể kết nối backend Smart Health. Vui lòng kiểm tra backend đang chạy và cấu hình CORS.",
  ],
  ["networkerror", "Không thể kết nối hệ thống. Vui lòng kiểm tra mạng hoặc backend."],
  ["load failed", "Không thể tải dữ liệu từ hệ thống. Vui lòng thử lại."],
  ["firebase admin is not configured", "Backend chưa cấu hình Firebase Admin SDK."],
  [
    "invalid firebase id token",
    "Phiên đăng nhập Firebase không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.",
  ],
  ["password", "Không thể cập nhật mật khẩu. Vui lòng kiểm tra lại thông tin và thử lại."],
  ["permission denied", "Tài khoản chưa có quyền thực hiện thao tác này."],
  ["forbidden", "Tài khoản chưa có quyền thực hiện thao tác này."],
  ["unauthorized", "Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn."],
  ["401", "Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn."],
  ["403", "Tài khoản chưa có quyền thực hiện thao tác này."],
  ["404", "Không tìm thấy API hoặc dữ liệu được yêu cầu."],
  ["500", "Backend Smart Health đang gặp lỗi nội bộ. Vui lòng kiểm tra log backend."],
];

function getRawMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }

  return "";
}

function getErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") {
      return code;
    }
  }

  return "";
}

function extractFirebaseAuthCode(message: string) {
  const match = /auth\/[a-z0-9-]+/i.exec(message);
  return match?.[0].toLowerCase() || "";
}

function hasVietnameseToneMark(message: string) {
  return /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(message);
}

function looksLikeEnglishError(message: string) {
  return /^[A-Za-z0-9\s._:;,'"()[\]{}!?/-]+$/.test(message);
}

export function toVietnameseErrorMessage(error: unknown, fallback = "Đã xảy ra lỗi. Vui lòng thử lại.") {
  const rawMessage = getRawMessage(error).trim();
  const directCode = getErrorCode(error).toLowerCase();
  const firebaseCode = directCode || extractFirebaseAuthCode(rawMessage);

  if (firebaseCode && FIREBASE_AUTH_MESSAGES[firebaseCode]) {
    return FIREBASE_AUTH_MESSAGES[firebaseCode];
  }

  if (rawMessage && EXACT_ERROR_MESSAGES[rawMessage]) {
    return EXACT_ERROR_MESSAGES[rawMessage];
  }

  const normalized = rawMessage.toLowerCase();
  for (const [needle, message] of PARTIAL_ERROR_MESSAGES) {
    if (normalized.includes(needle)) {
      return message;
    }
  }

  if (rawMessage && hasVietnameseToneMark(rawMessage) && !rawMessage.includes("\uFFFD")) {
    return rawMessage;
  }

  if (rawMessage && !looksLikeEnglishError(rawMessage)) {
    return rawMessage;
  }

  return fallback;
}
