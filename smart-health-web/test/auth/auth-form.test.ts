import { describe, expect, it } from "vitest";

import {
  getSafeAuthErrorMessage,
  validateClinicRegistrationStep,
  validateDoctorRegistrationStep,
  validateLogin,
} from "../../src/app/auth/auth-form";

describe("auth form contracts", () => {
  it("validates login fields before the identity provider is called", () => {
    expect(validateLogin({ email: "", password: "" })).toEqual({
      email: "Vui lòng nhập email.",
      password: "Vui lòng nhập mật khẩu.",
    });
    expect(validateLogin({ email: "not-an-email", password: "secret" })).toEqual({
      email: "Email chưa đúng định dạng.",
    });
  });

  it("validates each doctor registration step independently", () => {
    expect(
      validateDoctorRegistrationStep(0, {
        name: "",
        email: "bad",
        phone: "123",
        password: "short",
        confirmPassword: "different",
      }),
    ).toMatchObject({
      name: "Vui lòng nhập họ và tên.",
      email: "Email chưa đúng định dạng.",
      phone: "Số điện thoại Việt Nam cần có 10 chữ số và bắt đầu bằng 0.",
      password: "Mật khẩu cần ít nhất 8 ký tự.",
      confirmPassword: "Mật khẩu xác nhận chưa khớp.",
    });
    expect(validateDoctorRegistrationStep(1, { type: "" })).toEqual({
      type: "Vui lòng chọn mô hình hoạt động.",
    });
  });

  it("does not let clinic registration advance with an incomplete current step", () => {
    expect(
      validateClinicRegistrationStep(0, {
        repName: "",
        repEmail: "not-an-email",
        repPhone: "123",
        repRole: "",
        password: "short",
        confirmPassword: "mismatch",
      }),
    ).toMatchObject({
      repName: "Vui lòng nhập người đại diện.",
      repEmail: "Email chưa đúng định dạng.",
      repPhone: "Số điện thoại Việt Nam cần có 10 chữ số và bắt đầu bằng 0.",
      repRole: "Vui lòng chọn vai trò quản trị.",
    });
    expect(
      validateClinicRegistrationStep(3, {
        licenseFile: null,
      }),
    ).toEqual({ licenseFile: "Vui lòng chọn giấy phép hoạt động." });
  });

  it("converts provider details to safe Vietnamese recovery copy", () => {
    expect(getSafeAuthErrorMessage("Firebase: Error (auth/invalid-credential).")).toBe(
      "Email hoặc mật khẩu chưa đúng. Vui lòng kiểm tra và thử lại.",
    );
    expect(getSafeAuthErrorMessage("auth/network-request-failed")).toBe(
      "Không thể kết nối dịch vụ xác thực. Kiểm tra mạng rồi thử lại.",
    );
    expect(getSafeAuthErrorMessage("Unexpected internal stack trace")).toBe(
      "Không thể hoàn tất yêu cầu. Vui lòng thử lại.",
    );
  });
});
