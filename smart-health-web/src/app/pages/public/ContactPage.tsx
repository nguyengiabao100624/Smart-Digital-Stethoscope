import { useState } from "react";
import { cloneElement, type ReactElement } from "react";
import { Link } from "react-router";
import { CheckCircle2, Loader2, Mail, MapPin, Phone, ShieldAlert } from "lucide-react";
import { useSEO } from "@/lib/useSEO";
import { smartHealthApi } from "@/lib/smart-health-api";

type FormState = "idle" | "sending" | "success" | "error";

export default function ContactPage() {
  useSEO({
    title: "Liên hệ tư vấn triển khai | Smart Health Care",
    description:
      "Liên hệ đội ngũ Smart Health Care để được tư vấn triển khai nền tảng theo dõi sức khỏe từ xa cho bác sĩ và phòng khám.",
    path: "/lien-he",
  });

  const [state, setState] = useState<FormState>("idle");
  const [form, setForm] = useState({
    name: "",
    role: "",
    email: "",
    phone: "",
    clinic: "",
    scale: "",
    message: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    if (!form.name.trim()) nextErrors.name = "Vui lòng nhập họ và tên";
    if (!form.role) nextErrors.role = "Vui lòng chọn vai trò";
    if (!form.email.trim() || !/\S+@\S+\.\S+/.test(form.email))
      nextErrors.email = "Email liên hệ không hợp lệ";
    if (!form.phone.trim() || !/^0\d{9}$/.test(form.phone))
      nextErrors.phone = "Số điện thoại không hợp lệ";
    return nextErrors;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const nextErrors = validate();
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setState("sending");
    setErrors({});
    try {
      await smartHealthApi.contact(form);
      setState("success");
    } catch (error) {
      setErrors({
        submit: error instanceof Error ? error.message : "Không thể gửi yêu cầu liên hệ.",
      });
      setState("error");
    }
  };

  if (state === "success") {
    return (
      <div data-themable-page className="shc-home shc-success-page">
        <div className="shc-success-card">
          <CheckCircle2 size={44} />
          <h1>Yêu cầu đã được gửi</h1>
          <p>
            Đội ngũ Smart Health Care sẽ phản hồi qua email hoặc số điện thoại bạn cung cấp trong
            giờ làm việc.
          </p>
          <div>
            <button type="button" className="shc-button shc-button-secondary" onClick={() => setState("idle")}>
              Gửi yêu cầu khác
            </button>
            <Link to="/" className="shc-button shc-button-primary">
              Về trang chủ
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-themable-page className="shc-home shc-simple-page">
      <section className="shc-page-hero">
        <div className="shc-container">
          <p>Liên hệ</p>
          <h1>Nói rõ quy mô, chúng tôi tư vấn cách triển khai phù hợp.</h1>
          <span>
            Gửi thông tin cơ sở, vai trò và nhu cầu theo dõi từ xa. Đội ngũ Smart Health Care sẽ
            phản hồi bằng lộ trình triển khai thực tế, không dùng lời hứa mơ hồ.
          </span>
        </div>
      </section>

      <section className="shc-section">
        <div className="shc-container shc-contact-grid">
          <form method="post" onSubmit={handleSubmit} className="shc-contact-form">
            <div className="shc-form-grid">
              <Field label="Họ và tên" error={errors.name}>
                <input
                  autoComplete="name"
                  value={form.name}
                  onChange={(event) => {
                    setForm({ ...form, name: event.target.value });
                    setErrors({ ...errors, name: "" });
                  }}
                  placeholder="BS. Nguyễn Văn A"
                />
              </Field>
              <Field label="Vai trò" error={errors.role}>
                <select
                  value={form.role}
                  onChange={(event) => {
                    setForm({ ...form, role: event.target.value });
                    setErrors({ ...errors, role: "" });
                  }}
                >
                  <option value="" disabled>
                    Chọn vai trò
                  </option>
                  <option value="doctor">Bác sĩ</option>
                  <option value="owner">Quản trị cơ sở</option>
                  <option value="manager">Vận hành</option>
                  <option value="other">Khác</option>
                </select>
              </Field>
              <Field label="Email liên hệ" error={errors.email}>
                <input
                  type="email"
                  autoComplete="email"
                  value={form.email}
                  onChange={(event) => {
                    setForm({ ...form, email: event.target.value });
                    setErrors({ ...errors, email: "" });
                  }}
                  placeholder="contact@clinic.vn"
                />
              </Field>
              <Field label="Số điện thoại" error={errors.phone}>
                <input
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(event) => {
                    setForm({ ...form, phone: event.target.value });
                    setErrors({ ...errors, phone: "" });
                  }}
                  placeholder="0901234567"
                />
              </Field>
              <Field label="Tên cơ sở">
                <input
                  autoComplete="organization"
                  value={form.clinic}
                  onChange={(event) => setForm({ ...form, clinic: event.target.value })}
                  placeholder="Phòng khám Tim mạch An Tâm"
                />
              </Field>
              <Field label="Quy mô dự kiến">
                <select
                  value={form.scale}
                  onChange={(event) => setForm({ ...form, scale: event.target.value })}
                >
                  <option value="" disabled>
                    Chọn quy mô
                  </option>
                  <option value="small">Dưới 30 bệnh nhân</option>
                  <option value="medium">30 - 100 bệnh nhân</option>
                  <option value="large">100 - 500 bệnh nhân</option>
                  <option value="enterprise">Trên 500 bệnh nhân</option>
                </select>
              </Field>
            </div>

            <Field label="Nội dung cần tư vấn">
              <textarea
                value={form.message}
                onChange={(event) => setForm({ ...form, message: event.target.value })}
                rows={5}
                placeholder="Mô tả nhu cầu thiết bị, số bác sĩ, nhóm bệnh nhân hoặc quy trình hiện tại..."
              />
            </Field>

            {state === "error" && (
              <p className="shc-form-error">
                <ShieldAlert size={16} />
                {errors.submit || "Không thể gửi yêu cầu. Vui lòng thử lại hoặc gọi hotline."}
              </p>
            )}

            <button
              type="submit"
              disabled={state === "sending"}
              className="shc-button shc-button-primary shc-form-submit"
            >
              {state === "sending" && <Loader2 size={17} className="animate-spin" />}
              Gửi yêu cầu tư vấn
            </button>
          </form>

          <aside className="shc-contact-aside">
            <h2>Kênh liên hệ</h2>
            <p>
              Nếu bạn cần kiểm thử nhanh một workspace hoặc xác nhận cấu hình triển khai, gửi thông
              tin qua form hoặc liên hệ trực tiếp trong giờ làm việc.
            </p>
            <div className="shc-contact-methods">
              <a href="tel:18001234">
                <Phone size={18} />
                <span>
                  <strong>1800 1234</strong>
                  Hotline tư vấn
                </span>
              </a>
              <a href="mailto:connect@shcare.vn">
                <Mail size={18} />
                <span>
                  <strong>connect@shcare.vn</strong>
                  Email tư vấn
                </span>
              </a>
              <span>
                <MapPin size={18} />
                <span>
                  <strong>TP. Hồ Chí Minh</strong>
                  08:00 - 18:00, thứ 2 đến thứ 6
                </span>
              </span>
            </div>
            <Link to="/login" className="shc-button shc-button-secondary">
              Đã có workspace? Đăng nhập
            </Link>
          </aside>
        </div>
      </section>
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
  children: ReactElement<{ className?: string; id?: string; name?: string }>;
}) {
  const fieldName = `contact-${label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()}`;
  return (
    <label className="shc-field">
      <span>{label}</span>
      {cloneElement(children, {
        id: children.props.id || fieldName,
        name: children.props.name || fieldName,
      })}
      {error && <small>{error}</small>}
    </label>
  );
}
