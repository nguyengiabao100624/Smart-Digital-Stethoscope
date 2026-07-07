import React, { useState } from "react";
import { Link } from "react-router";
import { CheckCircle, Upload, Loader2, Database } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { createFirebaseAccount } from "../../../lib/firebase-client";
import { smartHealthApi } from "../../../lib/smart-health-api";
import { useSEO } from "@/lib/useSEO";

const steps = ["Tài khoản", "Cơ sở", "Quy mô", "Chứng thực", "Xác nhận"];

export default function RegisterClinicPage() {
  useSEO({
    title: "Đăng ký cơ sở y tế | Smart Health Care",
    description:
      "Gửi yêu cầu tạo workspace cho phòng khám, trung tâm chuyên khoa hoặc bệnh viện sử dụng Smart Health Care.",
    path: "/register/phong-kham",
  });

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [verificationDelivery, setVerificationDelivery] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [form, setForm] = useState({
    repName: "",
    repEmail: "",
    repPhone: "",
    repRole: "",
    password: "",
    confirmPassword: "",
    clinicName: "",
    clinicType: "",
    address: "",
    clinicPhone: "",
    clinicEmail: "",
    website: "",
    staffCount: "",
    patientCount: "",
    deviceCount: "",
    needs: [] as string[],
    licenseUploaded: false,
    logoUploaded: false,
    agreed: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [licenseFile, setLicenseFile] = useState<File | null>(null);
  const update = (k: string, v: unknown) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: "" }));
  };

  const toggleNeed = (n: string) => {
    setForm((f) => ({
      ...f,
      needs: f.needs.includes(n)
        ? f.needs.filter((x) => x !== n)
        : [...f.needs, n],
    }));
  };

  const next = async () => {
    if (step === steps.length - 1) {
      if (
        !form.repName ||
        !form.repEmail ||
        !form.clinicName ||
        !form.password ||
        form.password.length < 8 ||
        form.password !== form.confirmPassword ||
        !licenseFile ||
        !form.agreed
      ) {
        setErrors({
          submit:
            "Vui lòng điền đủ thông tin, mật khẩu khớp nhau, giấy phép và đồng ý điều khoản.",
        });
        return;
      }
      setSubmitting(true);
      setVerificationDelivery(null);
      try {
        const account = await createFirebaseAccount(
          form.repEmail,
          form.password,
        );
        await smartHealthApi.authenticateFirebase(account.idToken);
        await smartHealthApi.requestWorkspace({
          name: form.clinicName,
          workspaceType: form.clinicType === "hospital" ? "hospital" : "clinic",
          address: form.address,
          phone: form.clinicPhone || form.repPhone,
          email: form.clinicEmail || form.repEmail,
          website: form.website,
          representative: form.repName,
          metadata: {
            repRole: form.repRole,
            staffCount: form.staffCount,
            patientCount: form.patientCount,
            deviceCount: form.deviceCount,
            needs: form.needs,
          },
        });
        await smartHealthApi.uploadRoleRequestDocument(licenseFile);
        try {
          const delivery = await smartHealthApi.sendEmailVerification();
          setVerificationDelivery({
            ok: true,
            message:
              delivery.status === "verified"
                ? "Email đã được xác minh. Bạn có thể theo dõi trạng thái workspace."
                : `Email xác minh đã được gửi đến ${delivery.email}${delivery.provider ? ` qua ${delivery.provider}` : ""}.`,
          });
        } catch (deliveryError) {
          setVerificationDelivery({
            ok: false,
            message:
              deliveryError instanceof Error
                ? `Yêu cầu workspace đã được gửi, nhưng email xác minh chưa gửi được: ${deliveryError.message}`
                : "Yêu cầu workspace đã được gửi, nhưng email xác minh chưa gửi được.",
          });
        }
        setDone(true);
      } catch (error) {
        setErrors({
          submit:
            error instanceof Error
              ? error.message
              : "Không thể gửi yêu cầu workspace.",
        });
      } finally {
        setSubmitting(false);
      }
    } else {
      setStep((s) => s + 1);
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
          Yêu cầu workspace đã được gửi
        </h2>
        <p className="text-white/70 text-sm leading-relaxed mb-4">
          Đội ngũ Smart Health Care sẽ xác thực thông tin và liên hệ với{" "}
          <strong className="text-[#00FFD1]">
            {form.clinicName || "cơ sở"}
          </strong>{" "}
          trong 1-2 ngày làm việc. Email đại diện vẫn cần được xác minh để hoàn
          tất onboarding.
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
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#0B5C9A]/40 to-[#00FFD1]/20 mx-auto flex items-center justify-center mb-4 border border-[#00FFD1]/20 shadow-[0_0_20px_rgba(0,255,209,0.15)]">
          <Database size={24} className="text-[#00FFD1]" />
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight mb-2">
          Đăng ký Workspace
        </h1>
        <p className="text-[11px] uppercase tracking-widest text-[#4AA4E0]">
          Tổ chức & Trung Tâm Y Tế
        </p>
      </div>

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
              <div className="w-6 mx-2 h-[2px] rounded-full relative -top-3 overflow-hidden bg-white/10">
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
          void next();
        }}
      >
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
                  <FieldC label="Người đại diện">
                    <input
                      autoComplete="name"
                      value={form.repName}
                      onChange={(e) => update("repName", e.target.value)}
                      placeholder="Tên người đại diện pháp luật"
                    />
                  </FieldC>
                  <FieldC label="Email liên hệ">
                    <input
                      type="email"
                      autoComplete="email"
                      value={form.repEmail}
                      onChange={(e) => update("repEmail", e.target.value)}
                      placeholder="admin@clinic.vn"
                    />
                  </FieldC>
                  <FieldC label="Số điện thoại">
                    <input
                      autoComplete="tel"
                      inputMode="tel"
                      value={form.repPhone}
                      onChange={(e) => update("repPhone", e.target.value)}
                      placeholder="0901234567"
                    />
                  </FieldC>
                  <FieldC label="Mật khẩu">
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={form.password}
                      onChange={(e) => update("password", e.target.value)}
                      placeholder="Tối thiểu 8 ký tự"
                    />
                  </FieldC>
                  <FieldC label="Xác nhận mật khẩu">
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={form.confirmPassword}
                      onChange={(e) =>
                        update("confirmPassword", e.target.value)
                      }
                      placeholder="Nhập lại mật khẩu"
                    />
                  </FieldC>
                  <FieldC label="Vai trò quản trị">
                    <select
                      value={form.repRole}
                      onChange={(e) => update("repRole", e.target.value)}
                      className="appearance-none"
                    >
                      <option value="" disabled hidden>
                        Quyền quản trị
                      </option>
                      <option value="owner" className="bg-[#0d1a30] text-white">
                        Chủ phòng khám (Owner)
                      </option>
                      <option
                        value="director"
                        className="bg-[#0d1a30] text-white"
                      >
                        Giám đốc Y khoa (Director)
                      </option>
                      <option
                        value="manager"
                        className="bg-[#0d1a30] text-white"
                      >
                        Quản trị Vận hành (Manager)
                      </option>
                    </select>
                  </FieldC>
                </>
              )}

              {step === 1 && (
                <>
                  <FieldC label="Tên cơ sở">
                    <input
                      value={form.clinicName}
                      onChange={(e) => update("clinicName", e.target.value)}
                      placeholder="Phòng khám Tim mạch An Khang"
                    />
                  </FieldC>
                  <FieldC label="Loại hình cơ sở">
                    <select
                      value={form.clinicType}
                      onChange={(e) => update("clinicType", e.target.value)}
                      className="appearance-none"
                    >
                      <option value="" disabled hidden>
                        Chọn loại hình
                      </option>
                      <option
                        value="private"
                        className="bg-[#0d1a30] text-white"
                      >
                        Phòng khám đa khoa / tư nhân
                      </option>
                      <option
                        value="specialist"
                        className="bg-[#0d1a30] text-white"
                      >
                        Trung tâm Chuyên khoa (Tim/Phổi)
                      </option>
                      <option
                        value="hospital"
                        className="bg-[#0d1a30] text-white"
                      >
                        Bệnh viện quy mô vừa & nhỏ
                      </option>
                    </select>
                  </FieldC>
                  <FieldC label="Địa chỉ">
                    <input
                      value={form.address}
                      onChange={(e) => update("address", e.target.value)}
                      placeholder="123 Đường Số 1, TP. HCM"
                    />
                  </FieldC>
                  <div className="grid grid-cols-2 gap-4">
                    <FieldC label="Hotline">
                      <input
                        value={form.clinicPhone}
                        onChange={(e) => update("clinicPhone", e.target.value)}
                        placeholder="028 1234 5678"
                      />
                    </FieldC>
                    <FieldC label="Website cơ sở">
                      <input
                        value={form.website}
                        onChange={(e) => update("website", e.target.value)}
                        placeholder="domain.vn"
                      />
                    </FieldC>
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="grid grid-cols-3 gap-4">
                    <FieldC label="Nhân sự">
                      <input
                        type="number"
                        value={form.staffCount}
                        onChange={(e) => update("staffCount", e.target.value)}
                        placeholder="VD: 5"
                      />
                    </FieldC>
                    <FieldC label="Bệnh nhân">
                      <input
                        type="number"
                        value={form.patientCount}
                        onChange={(e) => update("patientCount", e.target.value)}
                        placeholder="VD: 100"
                      />
                    </FieldC>
                    <FieldC label="Thiết bị">
                      <input
                        type="number"
                        value={form.deviceCount}
                        onChange={(e) => update("deviceCount", e.target.value)}
                        placeholder="VD: 10"
                      />
                    </FieldC>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-widest text-white/60 mb-3 mt-2">
                      Nhu cầu sử dụng
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        "Theo dõi live",
                        "Quản lý thiết bị",
                        "Báo cáo dữ liệu",
                        "Chăm sóc từ xa",
                        "Phân quyền nhân sự",
                      ].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => toggleNeed(n)}
                          className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest border transition-all ${
                            form.needs.includes(n)
                              ? "bg-[#00FFD1]/20 border-[#00FFD1]/50 text-[#00FFD1] shadow-[inset_0_0_10px_rgba(0,255,209,0.2)]"
                              : "bg-white/8 border-white/10 text-white/60 hover:text-white hover:border-white/30"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {step === 3 && (
                <div className="space-y-4">
                  {[
                    {
                      key: "licenseUploaded",
                      label: "Giấy phép hoạt động (Bắt buộc)",
                      required: true,
                    },
                    {
                      key: "logoUploaded",
                      label: "Logo cơ sở (Tùy chọn)",
                      required: false,
                    },
                  ].map((f) => (
                    <div
                      key={f.key}
                      className={`relative border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-300 ${
                        (form as Record<string, unknown>)[f.key]
                          ? "border-[#00FFD1] bg-[#00FFD1]/5 shadow-[inset_0_0_20px_rgba(0,255,209,0.1)]"
                          : "border-white/20 hover:border-[#00FFD1]/50 hover:bg-white/8"
                      }`}
                    >
                      <input
                        type="file"
                        accept={
                          f.key === "licenseUploaded"
                            ? "application/pdf,image/jpeg,image/png"
                            : "image/jpeg,image/png"
                        }
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        onChange={(event) => {
                          const file = event.target.files?.[0] || null;
                          if (f.key === "licenseUploaded") setLicenseFile(file);
                          update(f.key, Boolean(file));
                        }}
                      />
                      {(form as Record<string, unknown>)[f.key] ? (
                        <div className="flex items-center justify-center gap-2 text-sm font-bold text-[#00FFD1] uppercase tracking-wider">
                          <CheckCircle
                            size={20}
                            className="drop-shadow-[0_0_10px_rgba(0,255,209,0.5)]"
                          />{" "}
                          Đã chọn tài liệu
                        </div>
                      ) : (
                        <>
                          <Upload
                            size={24}
                            className="mx-auto mb-2 text-white/55"
                          />
                          <div className="text-xs font-bold text-white/70 uppercase tracking-widest mb-1">
                            {f.label}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {step === 4 && (
                <div>
                  <div className="p-5 rounded-2xl border border-[#4AA4E0]/30 bg-gradient-to-br from-white/5 to-[#4AA4E0]/10 mb-6 shadow-[inset_0_0_20px_rgba(74,164,224,0.05)]">
                    <h4 className="text-[11px] font-bold uppercase tracking-widest text-[#4AA4E0] mb-4 flex items-center gap-2">
                      <Database size={14} /> Kiểm tra thông tin
                    </h4>
                    <div className="space-y-3">
                      {[
                        ["Đại diện", form.repName],
                        ["Email quản trị", form.repEmail],
                        ["Workspace", form.clinicName],
                        ["Loại Hình", form.clinicType],
                        ["Tọa độ", form.address],
                      ]
                        .filter(([, v]) => v)
                        .map(([k, v]) => (
                          <div
                            key={k}
                            className="flex gap-4 text-sm py-1.5 border-b border-white/5"
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
                      Tôi xác nhận việc khởi tạo Workspace tuân thủ{" "}
                      <Link
                        to="/bao-mat"
                        className="text-[#00FFD1] hover:underline"
                      >
                        Kiểm soát truy cập
                      </Link>{" "}
                      và{" "}
                      <Link
                        to="/phap-ly"
                        className="text-[#00FFD1] hover:underline"
                      >
                        Điều khoản triển khai
                      </Link>
                      .
                    </span>
                  </label>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex gap-4">
          {errors.submit && (
            <p className="mb-4 rounded-xl border border-[#FF4B4B]/30 bg-[#FF4B4B]/10 p-3 text-xs text-[#FF6B6B]">
              {errors.submit}
            </p>
          )}
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
              "Gửi yêu cầu workspace"
            ) : (
              "Tiến Tới"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function FieldC({
  label,
  children,
}: {
  label: string;
  children: React.ReactElement<{
    className?: string;
    id?: string;
    name?: string;
    style?: React.CSSProperties;
  }>;
}) {
  const fieldName = `clinic-${label
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
        className: `w-full px-4 h-12 rounded-xl border bg-white/8 outline-none text-white text-sm transition-all backdrop-blur-md placeholder:text-white/20 focus:border-[#00FFD1]/50 focus:ring-1 focus:ring-[#00FFD1]/50 ${children.props.className || ""}`,
        style: {
          borderColor: "rgba(255,255,255,0.1)",
          ...children.props.style,
        },
      })}
    </div>
  );
}
