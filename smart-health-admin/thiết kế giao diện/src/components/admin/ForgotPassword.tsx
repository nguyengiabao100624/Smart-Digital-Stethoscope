import React, { useState } from "react";
import { Link } from "@/components/admin/router-shim";
import { Stethoscope, Mail, ArrowLeft, CheckCircle2 } from "lucide-react";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Simulate API call
    setTimeout(() => {
      setIsLoading(false);
      setIsSuccess(true);
    }, 1500);
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-sm p-8">
          <div className="flex flex-col items-center mb-8 text-center">
            <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-success" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Kiểm tra email của bạn</h1>
            <p className="text-muted-foreground mt-2">Chúng tôi đã gửi link đặt lại mật khẩu đến</p>
            <p className="text-foreground font-medium mt-1">{email}</p>
          </div>

          <div className="space-y-4">
            <div className="bg-muted/30 border border-border rounded-lg p-4 text-sm">
              <p className="text-muted-foreground">
                <strong className="text-foreground">Lưu ý:</strong> Link sẽ hết hạn sau 1 giờ. Nếu
                bạn không nhận được email, vui lòng kiểm tra thư mục spam hoặc yêu cầu gửi lại.
              </p>
            </div>

            <Link
              to="/login"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-2.5 rounded-md transition-colors flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Quay lại đăng nhập
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-sm p-8">
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Stethoscope className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Quên mật khẩu?</h1>
          <p className="text-muted-foreground mt-2">
            Nhập email của bạn và chúng tôi sẽ gửi link đặt lại mật khẩu
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Email quản trị</label>
            <div className="relative">
              <Mail className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@smarthealth.vn"
                className="w-full pl-10 pr-4 py-2 border border-border rounded-md focus:border-ring focus:ring-1 focus:ring-ring outline-none"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium py-2.5 rounded-md transition-colors flex items-center justify-center disabled:opacity-70"
          >
            {isLoading ? "Đang gửi..." : "Gửi link đặt lại mật khẩu"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link
            to="/login"
            className="text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Quay lại đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
}
