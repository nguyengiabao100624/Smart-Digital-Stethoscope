export type AuthFieldErrors = Record<string, string>;

type Values = Record<string, unknown>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PROVIDER_TECHNICAL_PATTERN =
  /firebase|auth\/|exception|stack|trace|internal|unexpected|failed precondition|network-request-failed/i;

function text(values: Values, key: string) {
  return String(values[key] ?? "").trim();
}

function isVietnamesePhone(value: string) {
  return /^0\d{9}$/.test(value.replace(/[.\s-]/g, ""));
}

function isEmail(value: string) {
  return EMAIL_PATTERN.test(value.trim());
}

export function validateLogin(values: { email: string; password: string }): AuthFieldErrors {
  const errors: AuthFieldErrors = {};
  if (!values.email.trim()) errors.email = "Vui lòng nhập email.";
  else if (!isEmail(values.email)) errors.email = "Email chưa đúng định dạng.";
  if (!values.password) errors.password = "Vui lòng nhập mật khẩu.";
  return errors;
}

export function validateEmailOnly(email: string): AuthFieldErrors {
  if (!email.trim()) return { email: "Vui lòng nhập email." };
  if (!isEmail(email)) return { email: "Email chưa đúng định dạng." };
  return {};
}

export function validateDoctorRegistrationStep(step: number, values: Values): AuthFieldErrors {
  const errors: AuthFieldErrors = {};

  if (step === 0) {
    if (!text(values, "name")) errors.name = "Vui lòng nhập họ và tên.";
    if (!text(values, "email")) errors.email = "Vui lòng nhập email.";
    else if (!isEmail(text(values, "email"))) errors.email = "Email chưa đúng định dạng.";
    if (!text(values, "phone")) errors.phone = "Vui lòng nhập số điện thoại.";
    else if (!isVietnamesePhone(text(values, "phone"))) {
      errors.phone = "Số điện thoại Việt Nam cần có 10 chữ số và bắt đầu bằng 0.";
    }
    if (!String(values.password ?? "")) errors.password = "Vui lòng nhập mật khẩu.";
    else if (String(values.password).length < 8) {
      errors.password = "Mật khẩu cần ít nhất 8 ký tự.";
    }
    if (String(values.confirmPassword ?? "") !== String(values.password ?? "")) {
      errors.confirmPassword = "Mật khẩu xác nhận chưa khớp.";
    }
  }

  if (step === 1 && !text(values, "type")) {
    errors.type = "Vui lòng chọn mô hình hoạt động.";
  }

  if (step === 2) {
    if (!text(values, "specialty")) errors.specialty = "Vui lòng chọn chuyên khoa.";
    if (!text(values, "license")) errors.license = "Vui lòng nhập mã chứng chỉ hành nghề.";
  }

  if (step === 3) {
    if (text(values, "type") === "private") {
      if (!text(values, "clinicName")) errors.clinicName = "Vui lòng nhập tên phòng khám.";
      if (!text(values, "clinicAddress")) errors.clinicAddress = "Vui lòng nhập địa chỉ.";
    } else if (!text(values, "facilitySearch")) {
      errors.facilitySearch = "Vui lòng nhập cơ sở y tế đang làm việc.";
    }
  }

  if (step === 4 && !values.verificationFile && !values.fileUploaded) {
    errors.file = "Vui lòng chọn tài liệu xác minh.";
  }

  if (step === 5 && !values.agreed) {
    errors.agreed = "Bạn cần xác nhận điều khoản trước khi gửi hồ sơ.";
  }

  return errors;
}

export function validateClinicRegistrationStep(step: number, values: Values): AuthFieldErrors {
  const errors: AuthFieldErrors = {};

  if (step === 0) {
    if (!text(values, "repName")) errors.repName = "Vui lòng nhập người đại diện.";
    if (!text(values, "repEmail")) errors.repEmail = "Vui lòng nhập email.";
    else if (!isEmail(text(values, "repEmail"))) {
      errors.repEmail = "Email chưa đúng định dạng.";
    }
    if (!text(values, "repPhone")) errors.repPhone = "Vui lòng nhập số điện thoại.";
    else if (!isVietnamesePhone(text(values, "repPhone"))) {
      errors.repPhone = "Số điện thoại Việt Nam cần có 10 chữ số và bắt đầu bằng 0.";
    }
    if (!String(values.password ?? "")) errors.password = "Vui lòng nhập mật khẩu.";
    else if (String(values.password).length < 8) {
      errors.password = "Mật khẩu cần ít nhất 8 ký tự.";
    }
    if (String(values.confirmPassword ?? "") !== String(values.password ?? "")) {
      errors.confirmPassword = "Mật khẩu xác nhận chưa khớp.";
    }
    if (!text(values, "repRole")) errors.repRole = "Vui lòng chọn vai trò quản trị.";
  }

  if (step === 1) {
    if (!text(values, "clinicName")) errors.clinicName = "Vui lòng nhập tên cơ sở.";
    if (!text(values, "clinicType")) errors.clinicType = "Vui lòng chọn loại hình cơ sở.";
    if (!text(values, "address")) errors.address = "Vui lòng nhập địa chỉ cơ sở.";
    if (!text(values, "clinicPhone")) errors.clinicPhone = "Vui lòng nhập hotline cơ sở.";
  }

  if (step === 2) {
    for (const key of ["staffCount", "patientCount", "deviceCount"]) {
      const value = text(values, key);
      if (value && (!/^\d+$/.test(value) || Number(value) < 0)) {
        errors[key] = "Vui lòng nhập số nguyên không âm.";
      }
    }
  }

  if (step === 3 && !values.licenseFile && !values.licenseUploaded) {
    errors.licenseFile = "Vui lòng chọn giấy phép hoạt động.";
  }

  if (step === 4 && !values.agreed) {
    errors.agreed = "Bạn cần xác nhận điều khoản trước khi gửi yêu cầu.";
  }

  return errors;
}

export function getSafeAuthErrorMessage(error: unknown, fallback?: string) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();

  if (
    normalized.includes("invalid-credential") ||
    normalized.includes("wrong-password") ||
    normalized.includes("user-not-found")
  ) {
    return "Email hoặc mật khẩu chưa đúng. Vui lòng kiểm tra và thử lại.";
  }
  if (normalized.includes("network-request-failed") || normalized.includes("failed to fetch")) {
    return "Không thể kết nối dịch vụ xác thực. Kiểm tra mạng rồi thử lại.";
  }
  if (normalized.includes("too-many-requests")) {
    return "Bạn đã thử quá nhiều lần. Vui lòng chờ một lúc rồi thử lại.";
  }
  if (normalized.includes("email-already-in-use")) {
    return "Email này đã được sử dụng. Hãy đăng nhập hoặc khôi phục mật khẩu.";
  }
  if (normalized.includes("weak-password")) {
    return "Mật khẩu chưa đủ mạnh. Hãy dùng ít nhất 8 ký tự.";
  }
  if (
    message &&
    /[À-ỹ]/u.test(message) &&
    !PROVIDER_TECHNICAL_PATTERN.test(message) &&
    message.length <= 240
  ) {
    return message;
  }
  return fallback || "Không thể hoàn tất yêu cầu. Vui lòng thử lại.";
}
