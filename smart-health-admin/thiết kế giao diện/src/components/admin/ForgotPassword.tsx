import React, { useState } from "react";
import { Link } from "@/components/admin/router-shim";
import { ArrowLeft, CheckCircle2, Mail, Stethoscope } from "lucide-react";
import { sendFirebasePasswordReset } from "@/lib/firebase-client";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import { ThemeToggle } from "./ThemeToggle";

export function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await sendFirebasePasswordReset(email);
      setIsSuccess(true);
    } catch (err) {
      setError(toVietnameseErrorMessage(err, "Không thể gửi email đặt lại mật khẩu."));
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="relative w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm">
          <ThemeToggle className="absolute right-4 top-4" />
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">Kiểm tra email của bạn</h1>
            <p className="mt-2 text-muted-foreground">
              Nếu email này có tài khoản Firebase, hệ thống đã gửi link đặt lại mật khẩu đến
            </p>
            <p className="mt-1 font-medium text-foreground">{email.trim()}</p>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
              <p className="text-muted-foreground">
                <strong className="text-foreground">Lưu ý:</strong> Link đặt lại mật khẩu do
                Firebase Auth gửi và sẽ hết hạn theo cấu hình Firebase. Nếu chưa thấy email, hãy
                kiểm tra mục spam hoặc gửi lại sau vài phút.
              </p>
            </div>

            <Link
              to="/login"
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-primary py-2.5 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <ArrowLeft className="h-4 w-4" />
              Quay lại đăng nhập
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm">
        <ThemeToggle className="absolute right-4 top-4" />
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Stethoscope className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Quên mật khẩu?</h1>
          <p className="mt-2 text-muted-foreground">
            Nhập email tài khoản admin để Firebase gửi link đặt lại mật khẩu.
          </p>
        </div>

        <form method="post" onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Email quản trị</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="admin@smarthealth.vn"
                className="min-h-11 w-full rounded-md border border-border py-2 pl-10 pr-4 outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                required
              />
            </div>
          </div>

          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isLoading}
            className="flex min-h-11 w-full items-center justify-center rounded-md bg-primary py-2.5 font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-70"
          >
            {isLoading ? "Đang gửi..." : "Gửi link đặt lại mật khẩu"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link
            to="/login"
            className="flex min-h-11 items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Quay lại đăng nhập
          </Link>
        </div>
      </div>
    </div>
  );
}
