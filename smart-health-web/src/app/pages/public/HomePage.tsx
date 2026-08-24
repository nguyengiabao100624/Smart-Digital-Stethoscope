import { Link } from "react-router";
import {
  Activity,
  ArrowRight,
  Bell,
  CheckCircle2,
  Clock3,
  Database,
  FileText,
  HeartPulse,
  LockKeyhole,
  Monitor,
  Radio,
  RefreshCw,
  ShieldCheck,
  Stethoscope,
  UsersRound,
  Wifi,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, type CSSProperties } from "react";
import { usePublicMotionEnabled } from "@/app/context/PublicMotionContext";
import { useSEO } from "@/lib/useSEO";
import doctorVideoUrl from "../../../../MẪU UI UX/bacsi.mp4";

const workflow = [
  {
    title: "Thiết bị gửi lượt đo",
    description: "Âm tim phổi, trạng thái thiết bị và thông tin phiên đo đi vào cùng một hồ sơ.",
    icon: Stethoscope,
  },
  {
    title: "Workspace tự sắp hàng",
    description: "Bác sĩ nhìn thấy hồ sơ cần xem, thiết bị offline và cảnh báo theo đúng quyền.",
    icon: Activity,
  },
  {
    title: "Bác sĩ xác nhận",
    description: "AI chỉ hỗ trợ đọc tín hiệu. Ghi chú và quyết định lâm sàng luôn do bác sĩ chốt.",
    icon: CheckCircle2,
  },
];

const operatingCards = [
  {
    title: "Live monitoring",
    body: "Theo dõi phiên đo đang diễn ra, kết nối thiết bị và trạng thái bệnh nhân.",
    meta: "Realtime",
    icon: Wifi,
  },
  {
    title: "Review queue",
    body: "Gom lượt đo cần xem lại, giảm việc tìm hồ sơ thủ công trong ngày trực.",
    meta: "Ưu tiên",
    icon: Bell,
  },
  {
    title: "Consent & audit",
    body: "Chia sẻ hồ sơ theo quyền, thời hạn và lưu lại lịch sử thao tác nhạy cảm.",
    meta: "Kiểm soát",
    icon: ShieldCheck,
  },
  {
    title: "Clinical records",
    body: "Một nơi cho file âm thanh, kết quả hỗ trợ phân tích, ghi chú và báo cáo.",
    meta: "Hồ sơ",
    icon: FileText,
  },
];

const roleRows = [
  ["Bác sĩ", "Xem lượt đo, đọc cảnh báo, ghi chú và theo dõi bệnh nhân."],
  ["Cơ sở y tế", "Quản lý workspace, nhân sự, thiết bị, báo cáo và audit log."],
  ["Kỹ thuật viên", "Gán thiết bị, kiểm tra kết nối và hỗ trợ phiên đo tại điểm chăm sóc."],
  ["Gia đình", "Theo dõi dữ liệu được chia sẻ theo consent, không truy cập quá quyền."],
];

const proofCards = [
  {
    title: "Tín hiệu có ngữ cảnh",
    body: "Mỗi lượt đo đi kèm người bệnh, thiết bị, vị trí đo, thời điểm, consent và trạng thái xử lý.",
    icon: Database,
  },
  {
    title: "Không bỏ rơi ca live",
    body: "Workspace hiển thị thiết bị online/offline, phiên đang đo và cảnh báo cần xem lại.",
    icon: Radio,
  },
  {
    title: "Quyền truy cập rõ",
    body: "Bác sĩ, cơ sở, kỹ thuật viên và gia đình chỉ thấy phần việc được cấp trong workspace.",
    icon: LockKeyhole,
  },
  {
    title: "Bác sĩ là người chốt",
    body: "AI chỉ hỗ trợ phân tích tín hiệu. Ghi chú và quyết định lâm sàng luôn do bác sĩ xác nhận.",
    icon: Monitor,
  },
];

const handoffRows = [
  ["Thiết bị", "Heartbeat, kết nối, file âm thanh và metadata phiên đo."],
  ["Ứng dụng", "Người bệnh, consent, hướng dẫn đo và thông báo theo tài khoản."],
  ["Backend", "Xác thực Firebase, lưu hồ sơ, phân quyền workspace và audit thao tác."],
  ["Portal", "Review queue, live monitoring, records, reports và thiết bị cần xử lý."],
];

function ClinicalPreview({ reducedMotion }: { reducedMotion: boolean | null }) {
  return (
    <motion.div
      className="shc-preview"
      aria-label="Minh họa dashboard Smart Health"
      style={{
        backdropFilter: "blur(8px) saturate(120%)",
        WebkitBackdropFilter: "blur(8px) saturate(120%)",
      }}
      initial={reducedMotion ? false : { opacity: 0.9, x: 34, rotateY: -4 }}
      animate={reducedMotion ? undefined : { opacity: 1, x: 0, rotateY: 0 }}
      transition={{ duration: 0.9, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="shc-preview-topbar">
        <span />
        <span />
        <span />
        <p>Ví dụ giao diện · không phải dữ liệu bệnh nhân</p>
      </div>

      <div className="shc-preview-body">
        <div className="shc-preview-sidebar">
          <div className="shc-preview-logo">
            <HeartPulse size={18} />
          </div>
          {["Tổng quan", "Bệnh nhân", "Live", "Lượt đo", "Audit"].map((item, index) => (
            <div className={index === 2 ? "is-active" : ""} key={item}>
              {item}
            </div>
          ))}
        </div>

        <div className="shc-preview-main">
          <div className="shc-preview-heading">
            <div>
              <p>Bản xem trước workspace</p>
              <h3>Ngữ cảnh xử lý rõ ràng</h3>
            </div>
            <span>Online</span>
          </div>

          <div className="shc-signal-card">
            <div className="shc-signal-header">
              <span>Hồ sơ minh hoạ</span>
              <strong>Tín hiệu mẫu</strong>
            </div>
            <svg viewBox="0 0 360 96" role="img" aria-label="Dạng sóng minh họa">
              <polyline
                points="0,55 32,55 48,26 64,72 82,42 104,55 140,55 158,20 178,76 196,55 232,55 252,34 270,67 292,55 360,55"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="shc-signal-footer">
              <span>Tín hiệu đủ rõ để xem lại</span>
              <span>Vừa cập nhật</span>
            </div>
          </div>

          <div className="shc-preview-grid">
            {[
              ["Review queue", "Theo quyền", "Hồ sơ cần bác sĩ xem lại"],
              ["Thiết bị", "Có trạng thái", "Theo dõi online và offline"],
              ["Hồ sơ lượt đo", "Có ghi chú", "Lưu cùng consent và audit"],
            ].map(([label, value, hint]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <p>{hint}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function HomePage() {
  const motionEnabled = usePublicMotionEnabled();
  const reducedMotion = !motionEnabled;
  const cinemaRef = useRef<HTMLDivElement | null>(null);
  const revealFrom = (direction: "left" | "right" | "up", delay = 0) => {
    if (reducedMotion) return {};

    const offset =
      direction === "left"
        ? { x: -72, y: 12 }
        : direction === "right"
          ? { x: 72, y: 12 }
          : { x: 0, y: 54 };

    return {
      "data-shc-home-reveal": direction,
      "data-shc-home-reveal-state": "pending",
      style: {
        "--shc-home-reveal-x": `${offset.x}px`,
        "--shc-home-reveal-y": `${offset.y}px`,
        "--shc-home-reveal-delay": `${delay}s`,
      } as CSSProperties,
    };
  };

  useEffect(() => {
    const videos = cinemaRef.current?.querySelectorAll("video") ?? [];
    videos.forEach((video) => {
      if (!motionEnabled) {
        video.pause();
        return;
      }

      void video.play().catch(() => {
        // Muted inline autoplay can still be blocked by browser policy.
      });
    });
  }, [motionEnabled]);

  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".shc-home");
    if (!root) return;

    const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-shc-home-reveal]"));

    if (reducedMotion) {
      targets.forEach((element) => {
        delete element.dataset.shcHomeRevealState;
      });
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const element = entry.target as HTMLElement;
          element.dataset.shcHomeRevealState = "visible";
          observer.unobserve(element);
        });
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.06 },
    );

    targets.forEach((element) => {
      element.dataset.shcHomeRevealState = "pending";
      observer.observe(element);
    });

    return () => observer.disconnect();
  }, [reducedMotion]);

  useSEO({
    title: "Shcare | Workspace theo dõi tim phổi từ xa",
    description:
      "Shcare giúp bác sĩ và cơ sở y tế quản lý thiết bị, lượt đo, cảnh báo, consent và hồ sơ tim phổi từ xa trên một workspace rõ ràng.",
    path: "/",
  });

  return (
    <div data-themable-page className="shc-home">
      <section className="shc-hero">
        <div ref={cinemaRef} className="shc-hero-cinema" aria-hidden="true">
          <video
            className="shc-hero-video shc-hero-video-edge"
            src={doctorVideoUrl}
            autoPlay={motionEnabled}
            loop
            muted
            playsInline
            preload="metadata"
            tabIndex={-1}
          />
          <video
            className="shc-hero-video shc-hero-video-main"
            src={doctorVideoUrl}
            autoPlay={motionEnabled}
            loop
            muted
            playsInline
            preload="metadata"
            tabIndex={-1}
          />
          <div className="shc-hero-film shc-hero-film-main" />
          <div className="shc-hero-film shc-hero-film-secondary" />
          <div className="shc-hero-scanline" />
        </div>
        <div className="shc-container shc-hero-grid">
          <motion.div
            className="shc-hero-copy"
            initial={reducedMotion ? false : { opacity: 0, y: 28 }}
            animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="shc-hero-note">Workspace vận hành cho theo dõi tim phổi từ xa</p>
            <h1>Biết hồ sơ nào cần xem trước.</h1>
            <p className="shc-hero-lede">
              Shcare kết nối ống nghe thông minh, hồ sơ lượt đo, cảnh báo và phân quyền
              workspace để bác sĩ theo dõi tín hiệu từ xa mà không lẫn giữa thiết bị, người bệnh và
              trạng thái xử lý.
            </p>
            <div className="shc-hero-actions">
              <Link to="/register" className="shc-button shc-button-primary">
                Đăng ký sử dụng <ArrowRight size={18} />
              </Link>
              <Link to="/san-pham" className="shc-button shc-button-secondary">
                Xem giải pháp
              </Link>
            </div>
            <div className="shc-hero-assurance" aria-label="Điểm tin cậy">
              <span>
                <ShieldCheck size={16} /> Phân quyền theo workspace
              </span>
              <span>
                <Clock3 size={16} /> Realtime khi thiết bị online
              </span>
              <span>
                <UsersRound size={16} /> Hỗ trợ nhiều vai trò
              </span>
            </div>
          </motion.div>

          <ClinicalPreview reducedMotion={reducedMotion} />
        </div>
      </section>

      <section className="shc-section shc-section-proof" aria-label="Năng lực vận hành chính">
        <div className="shc-container shc-proof-grid">
          {proofCards.map((card, index) => (
            <motion.article
              {...revealFrom(index % 2 === 0 ? "left" : "right", index * 0.09)}
              key={card.title}
              className="shc-proof-card"
            >
              <card.icon size={20} />
              <h2>{card.title}</h2>
              <p>{card.body}</p>
            </motion.article>
          ))}
        </div>
      </section>

      <section className="shc-section">
        <div className="shc-container shc-workflow">
          <motion.div className="shc-section-heading" {...revealFrom("left")}>
            <p>Luồng vận hành</p>
            <h2>Từ phiên đo đến hồ sơ cần bác sĩ xem lại.</h2>
          </motion.div>
          <div className="shc-workflow-rail">
            {workflow.map((item, index) => (
              <motion.article
                {...revealFrom(index % 2 === 0 ? "left" : "right", index * 0.1)}
                key={item.title}
                className="shc-workflow-step"
              >
                <div className="shc-step-index">{String(index + 1).padStart(2, "0")}</div>
                <item.icon size={22} />
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section className="shc-section shc-section-tight">
        <div className="shc-container shc-operating-grid">
          <motion.div className="shc-operating-copy" {...revealFrom("left")}>
            <p>Không phải dashboard để trang trí</p>
            <h2>Thiết kế quanh việc bác sĩ phải làm trong một ngày trực.</h2>
            <p>
              Các module được tách theo nhiệm vụ: theo dõi phiên live, xem hàng đợi lượt đo, quản lý
              consent, kiểm tra thiết bị và xuất báo cáo. Giao diện ưu tiên trạng thái rõ ràng hơn
              hiệu ứng.
            </p>
            <Link to="/bang-gia" className="shc-text-link">
              Xem gói triển khai <ArrowRight size={16} />
            </Link>
          </motion.div>

          <div className="shc-operating-cards">
            {operatingCards.map((card, index) => (
              <motion.article
                {...revealFrom("right", index * 0.1)}
                key={card.title}
                className="shc-operating-card"
              >
                <div>
                  <card.icon size={20} />
                  <span>{card.meta}</span>
                </div>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section className="shc-section shc-handoff-section">
        <div className="shc-container shc-handoff-grid">
          <motion.div className="shc-handoff-copy" {...revealFrom("left")}>
            <p>Handoff dữ liệu</p>
            <h2>Không để bác sĩ đoán dữ liệu đang nằm ở đâu.</h2>
            <p>
              Trang đầu cần cho người dùng hiểu hệ thống không chỉ là thiết bị. Mỗi tầng có nhiệm vụ
              riêng và được nối lại thành một dòng vận hành: thu tín hiệu, xác thực, lưu hồ sơ, sắp
              hàng việc cần làm và ghi lại thao tác nhạy cảm.
            </p>
            <Link to="/san-pham" className="shc-text-link">
              Xem hệ sản phẩm <ArrowRight size={16} />
            </Link>
          </motion.div>

          <motion.div
            className="shc-handoff-panel"
            aria-label="Các tầng dữ liệu Smart Health"
            {...revealFrom("right", 0.12)}
          >
            <div className="shc-handoff-panel-head">
              <RefreshCw size={16} />
              <span>Chuỗi xử lý có kiểm soát</span>
            </div>
            {handoffRows.map(([label, description]) => (
              <div key={label} className="shc-handoff-row">
                <strong>{label}</strong>
                <p>{description}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="shc-section">
        <div className="shc-container shc-roles">
          <motion.div className="shc-section-heading" {...revealFrom("left")}>
            <p>Vai trò rõ ràng</p>
            <h2>Mỗi người vào đúng phần việc của mình.</h2>
          </motion.div>
          <div className="shc-role-table">
            {roleRows.map(([role, description], index) => (
              <motion.div
                {...revealFrom(index % 2 === 0 ? "left" : "right", index * 0.08)}
                key={role}
                className="shc-role-row"
              >
                <strong>{role}</strong>
                <p>{description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <motion.section className="shc-cta" {...revealFrom("up")}>
        <div className="shc-container shc-cta-card">
          <div>
            <p>Triển khai trên shcare.web.app</p>
            <h2>Sẵn sàng đưa workspace vào chạy thật?</h2>
          </div>
          <div className="shc-cta-actions">
            <Link to="/register" className="shc-button shc-button-primary">
              Đăng ký bác sĩ
            </Link>
            <Link to="/register/phong-kham" className="shc-button shc-button-secondary">
              Đăng ký cơ sở
            </Link>
          </div>
        </div>
      </motion.section>
    </div>
  );
}
