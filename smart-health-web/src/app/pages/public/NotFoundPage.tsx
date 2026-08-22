import { Link } from "react-router";
import { ArrowRight, Home, LogIn, SearchX, Wrench } from "lucide-react";

interface NotFoundPageProps {
  maintenance?: boolean;
}

export default function NotFoundPage({ maintenance }: NotFoundPageProps) {
  if (maintenance) {
    return (
      <section className="shc-public-state" data-state="maintenance">
        <div className="shc-public-state-icon" aria-hidden="true">
          <Wrench size={28} />
        </div>
        <p className="shc-public-eyebrow">Trạng thái dịch vụ</p>
        <h1>Shcare đang bảo trì</h1>
        <p>
          Một số chức năng có thể tạm thời chưa sẵn sàng. Vui lòng thử lại sau
          hoặc mở trang liên hệ để xem các kênh hỗ trợ đã công bố.
        </p>
        <div className="shc-public-state-actions">
          <Link to="/" className="shc-button shc-button-secondary">
            <Home size={17} /> Về trang chủ
          </Link>
          <Link to="/lien-he" className="shc-button shc-button-primary">
            Xem kênh hỗ trợ <ArrowRight size={17} />
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="shc-public-state" data-state="not-found">
      <div className="shc-public-state-icon" aria-hidden="true">
        <SearchX size={28} />
      </div>
      <p className="shc-public-state-code">404</p>
      <h1>Không tìm thấy trang</h1>
      <p>
        Đường dẫn có thể đã thay đổi hoặc không tồn tại. Bạn có thể quay về
        trang chủ hoặc đăng nhập để tiếp tục công việc.
      </p>
      <div className="shc-public-state-actions">
        <Link to="/" className="shc-button shc-button-primary">
          <Home size={17} /> Về trang chủ
        </Link>
        <Link to="/login" className="shc-button shc-button-secondary">
          <LogIn size={17} /> Đăng nhập
        </Link>
      </div>
    </section>
  );
}
