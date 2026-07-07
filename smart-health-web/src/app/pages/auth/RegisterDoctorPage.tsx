import React, { useState } from "react";
import { Link } from "react-router";
import { CheckCircle, Upload, Loader2, Fingerprint } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { createFirebaseAccount } from "../../../lib/firebase-client";
import { smartHealthApi } from "../../../lib/smart-health-api";
import { useSEO } from "@/lib/useSEO";

const steps = [
  "Tài khoản",
  "Loại Đăng Ký",
  "Chuyên Môn",
  "Nơi Làm Việc",
  "Chứng Chỉ",
  "Xác Nhận",
];

export default function RegisterDoctorPage() {
  useSEO({
    title: "Đăng ký bác sĩ | Smart Health Care",
    description:
      "Gửi hồ sơ đăng ký bác sĩ hoặc bác sĩ tư nhân để sử dụng Workspace Portal Smart Health.",
    path: "/register",
  });

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [verificationDelivery, setVerificationDelivery] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    type: "" as "private" | "clinic" | "",
    specialty: "",
    license: "",
    reason: "",
    clinicName: "",
    clinicAddress: "",
    clinicPhone: "",
    facilitySearch: "",
    fileUploaded: false,
    agreed: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [verificationFile, setVerificationFile] = useState<File | null>(null);

  const update = (k: string, v: unknown) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  const validateStep = () => {
    const e: Record<string, string> = {};
    if (step === 0) {
      if (!form.name) e.name = "Vui lòng nhập họ tên";
      if (!form.email || !/\S+@\S+\.\S+/.test(form.email))
        e.email = "Email không hợp lệ";
      if (!form.phone || !/^0\d{9}$/.test(form.phone))
        e.phone = "Số điện thoại không hợp lệ";
      if (!form.password || form.password.length < 8)
        e.password = "Mật khẩu tối thiểu 8 ký tự";
      if (form.password !== form.confirmPassword)
        e.confirmPassword = "Mật khẩu xác nhận không khớp";
    }
    if (step === 1 && !form.type) e.type = "Vui lòng chọn loại đăng ký";
    if (step === 2 && !form.specialty)
      e.specialty = "Vui lòng nhập chuyên khoa";
    if (step === 4 && !form.fileUploaded)
      e.file = "Vui lòng tải lên tài liệu xác minh";
    if (step === 5 && !form.agreed) e.agreed = "Vui lòng đồng ý điều khoản";
    return e;
  };

  const next = () => {
    const e = validateStep();
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }
    if (step === steps.length - 1) {
      handleSubmit();
    } else {
      setStep((s) => s + 1);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setVerificationDelivery(null);
    try {
      const account = await createFirebaseAccount(form.email, form.password);
      await smartHealthApi.authenticateFirebase(account.idToken);
      await smartHealthApi.requestRole({
        requestedRole: "doctor",
        accountType: form.type === "private" ? "solo_doctor" : "doctor",
        workspaceType: form.type === "private" ? "solo_practice" : "clinic",
        name: form.name,
        phone: form.phone,
        specialty: form.specialty,
        license: form.license,
        reason: form.reason,
        clinicName:
          form.type === "private" ? form.clinicName : form.facilitySearch,
        hospital:
          form.type === "private" ? form.clinicName : form.facilitySearch,
      });
      if (verificationFile)
        await smartHealthApi.uploadRoleRequestDocument(verificationFile);
      try {
        const delivery = await smartHealthApi.sendEmailVerification();
        setVerificationDelivery({
          ok: true,
          message:
            delivery.status === "verified"
              ? "Email đã được xác minh. Bạn có thể xem trạng thái hồ sơ."
              : `Email xác minh đã được gửi đến ${delivery.email}${delivery.provider ? ` qua ${delivery.provider}` : ""}.`,
        });
      } catch (deliveryError) {
        setVerificationDelivery({
          ok: false,
          message:
            deliveryError instanceof Error
              ? `Hồ sơ đã được gửi, nhưng email xác minh chưa gửi được: ${deliveryError.message}`
              : "Hồ sơ đã được gửi, nhưng email xác minh chưa gửi được.",
        });
      }
      setDone(true);
    } catch (error) {
      setErrors((current) => ({
        ...current,
        submit:
          error instanceof Error
            ? error.message
            : "Không thể gửi hồ sơ đăng ký.",
      }));
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center py-6"
      >
        <div className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 bg-[#00FFD1]/10 border border-[#00FFD1]/30 shadow-[0_0_30px_rgba(0,255,209,0.2)]">
          <CheckCircle size={40} className="text-[#00FFD1]" />
        </div>
        <h2 className="text-2xl font-black text-white mb-3">
          Hồ sơ đã được gửi
        </h2>
        <p className="text-white/70 text-sm leading-relaxed mb-4">
          Hồ sơ bác sĩ đã được ghi nhận. Vui lòng xác minh email{" "}
          <strong className="text-[#00FFD1]">{form.email}</strong> để đội ngũ có
          thể duyệt hồ sơ trong 1-3 ngày.
        </p>
        {verificationDelivery && (
          <div
            className={`mb-6 rounded-xl border px-4 py-3 text-left text-xs leading-relaxed ${
              verificationDelivery.ok
                ? "border-[#00FFD1]/30 bg-[#00FFD1]/10 text-[#B9FFF1]"
                : "border-[#F59E0B]/40 bg-[#F59E0B]/10 text-[#FDE68A]"
            }`}
          >
            {verificationDelivery.message}
          </div>
        )}
        <Link
          to="/xac-thuc-email"
          className="block w-full text-center py-3.5 rounded-xl bg-gradient-to-r from-[#0B5C9A] to-[#00FFD1] text-[#0d1a30] font-bold uppercase tracking-widest shadow-[0_0_20px_rgba(0,255,209,0.3)] mb-4 hover:scale-[1.02] transition-transform"
        >
          Xác thực email
        </Link>
        <Link
          to="/login"
          className="block text-center text-[11px] font-bold uppercase tracking-wider text-white/60 hover:text-white transition-colors"
        >
          Về cổng đăng nhập
        </Link>
      </motion.div>
    );
  }

  return (
    <div>
      <div className="mb-8 text-center">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#7257E8]/40 to-[#00FFD1]/20 mx-auto flex items-center justify-center mb-4 border border-[#00FFD1]/20 shadow-[0_0_20px_rgba(0,255,209,0.15)]">
          <Fingerprint size={24} className="text-[#00FFD1]" />
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight mb-2">
          Đăng ký Chuyên Gia Y Tế
        </h1>
        <p className="text-[11px] uppercase tracking-widest text-[#00FFD1]">
          Yêu cầu quyền Workspace Portal
        </p>
      </div>

      {/* Stepper */}
      <div className="shc-auth-stepper flex items-center mb-8 overflow-x-auto pb-4 scrollbar-hide">
        {steps.map((s, idx) => (
          <div key={s} className="flex items-center flex-shrink-0">
            <div className="flex flex-col items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                  idx < step
                    ? "bg-[#00FFD1] text-[#0d1a30] shadow-[0_0_10px_rgba(0,255,209,0.5)]"
                    : idx === step
                      ? "bg-white/10 border-2 border-[#00FFD1] text-[#00FFD1] shadow-[0_0_15px_rgba(0,255,209,0.3)]"
                      : "bg-white/8 border border-white/10 text-white/55"
                }`}
              >
                {idx < step ? "✓" : idx + 1}
              </div>
              <span
                className={`text-[9px] uppercase tracking-widest font-bold whitespace-nowrap ${idx === step ? "text-[#00FFD1]" : "text-white/55"}`}
              >
                {s}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div className="w-8 mx-2 h-[2px] rounded-full relative -top-3 overflow-hidden bg-white/10">
                <div
                  className="absolute top-0 left-0 h-full bg-[#00FFD1] transition-all duration-500"
                  style={{ width: idx < step ? "100%" : "0%" }}
                ></div>
              </div>
            )}
          </div>
        ))}
      </div>

      <form
        method="post"
        onSubmit={(event) => {
          event.preventDefault();
          next();
        }}
      >
        {/* Form Content */}
        <div className="space-y-5 mb-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="space-y-4"
            >
              {step === 0 && (
                <>
                  <Field label="Họ và Tên" error={errors.name}>
                    <input
                      autoComplete="name"
                      value={form.name}
                      onChange={(e) => update("name", e.target.value)}
                      placeholder="BS. Nguyễn Văn A"
                    />
                  </Field>
                  <Field label="Email Y Tế" error={errors.email}>
                    <input
                      type="email"
                      autoComplete="email"
                      value={form.email}
                      onChange={(e) => update("email", e.target.value)}
                      placeholder="bacsia@benhvien.vn"
                    />
                  </Field>
                  <Field label="Số Điện Thoại" error={errors.phone}>
                    <input
                      autoComplete="tel"
                      inputMode="tel"
                      value={form.phone}
                      onChange={(e) => update("phone", e.target.value)}
                      placeholder="0901234567"
                    />
                  </Field>
                  <Field label="Mật Khẩu" error={errors.password}>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={form.password}
                      onChange={(e) => update("password", e.target.value)}
                      placeholder="Tối thiểu 8 ký tự"
                    />
                  </Field>
                  <Field label="Xác Nhận Khóa" error={errors.confirmPassword}>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={form.confirmPassword}
                      onChange={(e) =>
                        update("confirmPassword", e.target.value)
                      }
                      placeholder="Nhập lại khóa bảo mật"
                    />
                  </Field>
                </>
              )}

              {step === 1 && (
                <div className="space-y-3">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-white/70 mb-4">
                    Mô hình hoạt động của bạn:
                  </p>
                  {[
                    {
                      val: "private",
                      label: "Bác sĩ Tư nhân",
                      desc: "Hành nghề độc lập hoặc phòng khám quy mô nhỏ.",
                    },
                    {
                      val: "clinic",
                      label: "Cơ sở Y Tế / BV",
                      desc: "Làm việc trong mạng lưới cơ sở y tế đã liên kết.",
                    },
                  ].map((opt) => (
                    <label
                      key={opt.val}
                      className={`shc-registration-choice flex items-start gap-4 p-5 rounded-2xl border cursor-pointer transition-all duration-300 ${form.type === opt.val ? "is-selected bg-[#00FFD1]/10 border-[#00FFD1]/50 shadow-[inset_0_0_20px_rgba(0,255,209,0.1)]" : "bg-white/8 border-white/10 hover:border-white/20"}`}
                      onClick={() => update("type", opt.val)}
                    >
                      <input
                        type="radio"
                        name="doctor-registration-type"
                        value={opt.val}
                        checked={form.type === opt.val}
                        onChange={() => update("type", opt.val)}
                        className="sr-only"
                      />
                      <div
                        className={`mt-1 w-4 h-4 rounded-full border-2 flex items-center justify-center ${form.type === opt.val ? "border-[#00FFD1]" : "border-white/30"}`}
                      >
                        {form.type === opt.val && (
                          <div className="w-2 h-2 rounded-full bg-[#00FFD1] shadow-[0_0_5px_rgba(0,255,209,1)]" />
                        )}
                      </div>
                      <div>
                        <div
                          className={`text-sm font-bold tracking-wide ${form.type === opt.val ? "text-[#00FFD1]" : "text-white"}`}
                        >
                          {opt.label}
                        </div>
                        <div className="text-[11px] text-white/60 mt-1">
                          {opt.desc}
                        </div>
                      </div>
                    </label>
                  ))}
                  {errors.type && (
                    <p className="text-xs text-[#FF4B4B] mt-2 font-medium">
                      {errors.type}
                    </p>
                  )}
                </div>
              )}

              {step === 2 && (
                <>
                  <Field label="Chuyên Khoa" error={errors.specialty}>
                    <select
                      value={form.specialty}
                      onChange={(e) => update("specialty", e.target.value)}
                      className="appearance-none"
                    >
                      <option value="" disabled hidden>
                        Chọn mạng lưới chuyên môn
                      </option>
                      {[
                        "Tim mạch",
                        "Hô hấp",
                        "Nội tổng quát",
                        "Nhi khoa",
                        "Lão khoa",
                        "Gia đình",
                        "Khác",
                      ].map((s) => (
                        <option
                          key={s}
                          value={s}
                          className="bg-[#0d1a30] text-white"
                        >
                          {s}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Mã Chứng Chỉ Hành Nghề (CCHN)">
                    <input
                      value={form.license}
                      onChange={(e) => update("license", e.target.value)}
                      placeholder="VD: CCHN-2024-XXXXX"
                    />
                  </Field>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-widest text-white/60 mb-2">
                      Mục tiêu sử dụng
                    </label>
                    <textarea
                      value={form.reason}
                      onChange={(e) => update("reason", e.target.value)}
                      rows={3}
                      placeholder="Bạn muốn dùng workspace để theo dõi nhóm bệnh nhân nào?"
                      className="w-full px-4 py-3 rounded-xl border border-white/10 bg-white/8 outline-none text-white text-sm resize-none focus:border-[#00FFD1]/50 focus:ring-1 focus:ring-[#00FFD1]/50 placeholder:text-white/20 transition-all backdrop-blur-md"
                    />
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  {form.type === "private" ? (
                    <>
                      <Field label="Tên Phòng Khám">
                        <input
                          value={form.clinicName}
                          onChange={(e) => update("clinicName", e.target.value)}
                          placeholder="Tên cơ sở tư nhân..."
                        />
                      </Field>
                      <Field label="Tọa Độ (Địa Chỉ)">
                        <input
                          value={form.clinicAddress}
                          onChange={(e) =>
                            update("clinicAddress", e.target.value)
                          }
                          placeholder="Vị trí trên bản đồ..."
                        />
                      </Field>
                      <Field label="Kênh Liên Lạc Chính">
                        <input
                          value={form.clinicPhone}
                          onChange={(e) =>
                            update("clinicPhone", e.target.value)
                          }
                          placeholder="Hotline..."
                        />
                      </Field>
                    </>
                  ) : (
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-widest text-white/60 mb-2">
                        Tra Cứu Mạng Lưới Y Tế
                      </label>
                      <input
                        value={form.facilitySearch}
                        onChange={(e) =>
                          update("facilitySearch", e.target.value)
                        }
                        placeholder="Tìm kiếm cơ sở đã liên kết AI..."
                        className="w-full px-4 h-12 rounded-xl border border-white/10 bg-white/8 outline-none text-white text-sm focus:border-[#00FFD1]/50 focus:ring-1 focus:ring-[#00FFD1]/50 placeholder:text-white/20 transition-all backdrop-blur-md"
                      />
                      <p className="text-[10px] uppercase tracking-widest mt-2 text-[#00FFD1]/70">
                        Hệ thống sẽ gợi ý cơ sở nếu khớp dữ liệu.
                      </p>
                    </div>
                  )}
                </>
              )}

              {step === 4 && (
                <div>
                  <div
                    className={`relative border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300 ${form.fileUploaded ? "border-[#00FFD1] bg-[#00FFD1]/5 shadow-[inset_0_0_30px_rgba(0,255,209,0.1)]" : "border-white/20 hover:border-[#00FFD1]/50 hover:bg-white/8"}`}
                  >
                    <input
                      type="file"
                      accept="application/pdf,image/jpeg,image/png"
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        if (file && file.size > 10 * 1024 * 1024) {
                          setErrors((current) => ({
                            ...current,
                            file: "File không được vượt quá 10 MB",
                          }));
                          return;
                        }
                        setVerificationFile(file);
                        update("fileUploaded", Boolean(file));
                      }}
                    />
                    {form.fileUploaded ? (
                      <>
                        <CheckCircle
                          size={32}
                          className="mx-auto mb-3 text-[#00FFD1] drop-shadow-[0_0_10px_rgba(0,255,209,0.5)]"
                        />
                        <div className="text-sm font-bold text-[#00FFD1] uppercase tracking-wider">
                          Đã chọn tài liệu
                        </div>
                      </>
                    ) : (
                      <>
                        <Upload
                          size={32}
                          className="mx-auto mb-3 text-white/55"
                        />
                        <div className="text-sm font-bold text-white/70 uppercase tracking-wider mb-2">
                          Tải Lên Chứng Chỉ Bản Mềm
                        </div>
                        <div className="text-[10px] text-white/55 uppercase tracking-widest">
                          Định dạng: PDF, JPG, PNG (Max 10MB)
                        </div>
                      </>
                    )}
                  </div>
                  {errors.file && (
                    <p className="text-xs text-[#FF4B4B] mt-3 font-medium">
                      {errors.file}
                    </p>
                  )}
                </div>
              )}

              {step === 5 && (
                <div>
                  <div className="p-5 rounded-2xl border border-[#00FFD1]/20 bg-gradient-to-br from-white/5 to-[#00FFD1]/5 mb-6 shadow-[inset_0_0_20px_rgba(0,255,209,0.05)]">
                    <h4 className="text-[11px] font-bold uppercase tracking-widest text-[#00FFD1] mb-4 flex items-center gap-2">
                      <CheckCircle size={14} /> Kiểm Tra Dữ Liệu
                    </h4>
                    <div className="space-y-3">
                      {[
                        ["Định Danh", form.name],
                        ["Email đăng nhập", form.email],
                        [
                          "Mô Hình",
                          form.type === "private" ? "Cá Nhân" : "Tổ Chức",
                        ],
                        ["Lĩnh Vực", form.specialty],
                        ["Cơ Sở", form.clinicName || form.facilitySearch],
                      ]
                        .filter(([, v]) => v)
                        .map(([k, v]) => (
                          <div
                            key={k}
                            className="flex items-start gap-4 border-b border-white/5 pb-2 text-sm"
                          >
                            <span className="text-white/60 uppercase tracking-wider text-[10px] font-bold w-24 pt-0.5">
                              {k}
                            </span>
                            <span className="text-white font-medium">{v}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                  <label className="flex items-start gap-3 cursor-pointer group">
                    <div
                      className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center border transition-colors ${form.agreed ? "bg-[#00FFD1] border-[#00FFD1]" : "border-white/30 group-hover:border-[#00FFD1]/50"}`}
                    >
                      {form.agreed && (
                        <CheckCircle size={12} className="text-[#0d1a30]" />
                      )}
                    </div>
                    <input
                      type="checkbox"
                      checked={form.agreed}
                      onChange={(e) => update("agreed", e.target.checked)}
                      className="hidden"
                    />
                    <span className="text-xs text-white/70 leading-relaxed font-medium">
                      Tôi xác nhận tuân thủ{" "}
                      <a
                        href="/bao-mat"
                        className="text-[#00FFD1] hover:underline"
                      >
                        Kiểm soát truy cập
                      </a>{" "}
                      &{" "}
                      <a
                        href="/phap-ly"
                        className="text-[#00FFD1] hover:underline"
                      >
                        Điều Khoản Mạng Lưới
                      </a>
                      .
                    </span>
                  </label>
                  {errors.agreed && (
                    <p className="text-xs text-[#FF4B4B] mt-2 font-medium">
                      {errors.agreed}
                    </p>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation */}
        {errors.submit && (
          <p className="mb-4 rounded-xl border border-[#FF4B4B]/30 bg-[#FF4B4B]/10 p-3 text-xs text-[#FF6B6B]">
            {errors.submit}
          </p>
        )}
        <div className="flex gap-4">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="flex-1 py-3.5 rounded-xl border border-white/10 bg-white/8 text-white/60 text-xs font-bold uppercase tracking-widest hover:bg-white/10 hover:text-white transition-all"
            >
              Lùi Lại
            </button>
          )}
          <button
            type="submit"
            disabled={submitting}
            className={`flex-[2] py-3.5 rounded-xl text-[#0d1a30] text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(0,255,209,0.2)] hover:shadow-[0_0_30px_rgba(0,255,209,0.4)] hover:scale-[1.02] ${submitting ? "bg-white/20 text-white/70" : "bg-gradient-to-r from-[#0B5C9A] to-[#00FFD1]"}`}
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin text-[#00FFD1]" />{" "}
                Đang gửi...
              </>
            ) : step === steps.length - 1 ? (
              "Gửi hồ sơ"
            ) : (
              "Tiến Tới"
            )}
          </button>
        </div>
      </form>

      <div className="mt-6 text-center">
        <Link
          to="/login"
          className="text-[11px] font-bold uppercase tracking-wider text-white/60 hover:text-white transition-colors"
        >
          Đã có Workspace? Đăng Nhập
        </Link>
      </div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactElement<{
    className?: string;
    id?: string;
    name?: string;
    style?: React.CSSProperties;
  }>;
}) {
  const fieldName = `doctor-${label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()}`;
  return (
    <div>
      <label
        htmlFor={children.props.id || fieldName}
        className="block text-[11px] font-bold uppercase tracking-widest text-white/60 mb-2"
      >
        {label}
      </label>
      {React.cloneElement(children, {
        id: children.props.id || fieldName,
        name: children.props.name || fieldName,
        className: `w-full px-4 h-12 rounded-xl border bg-white/8 outline-none text-white text-sm transition-all backdrop-blur-md placeholder:text-white/20 ${children.props.className || ""}`,
        style: {
          borderColor: error ? "#FF4B4B" : "rgba(255,255,255,0.1)",
          ...children.props.style,
        },
      })}
      {error && (
        <p className="text-[11px] text-[#FF4B4B] mt-1.5 font-medium">{error}</p>
      )}
    </div>
  );
}
