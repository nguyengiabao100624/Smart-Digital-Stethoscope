import { Link, useNavigate } from "react-router";
import { ArrowLeft, Building2, LayoutDashboard, ShieldOff } from "lucide-react";

import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";

export default function PermissionDeniedPage() {
  const navigate = useNavigate();

  return (
    <div
      data-testid="portal-permission-denied"
      className="mx-auto flex min-h-[28rem] max-w-3xl items-center justify-center p-4 sm:p-6"
    >
      <Card role="alert" className="w-full border-destructive/30 shadow-sm">
        <CardHeader className="items-center text-center">
          <span className="mb-2 grid size-14 place-items-center rounded-full bg-destructive/10 text-destructive">
            <ShieldOff aria-hidden="true" size={28} />
          </span>
          <CardTitle>Không có quyền truy cập</CardTitle>
          <CardDescription className="max-w-xl text-balance">
            Tài khoản hiện tại không có capability cần thiết để mở tính năng
            này trong workspace đang chọn.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-center text-sm text-muted-foreground">
            Nếu quyền vừa được thay đổi, hãy chọn lại workspace hoặc đăng nhập
            lại. Bạn cũng có thể liên hệ quản trị viên workspace để kiểm tra
            membership.
          </p>
          <div className="flex flex-col-reverse justify-center gap-3 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => navigate(-1)}
            >
              <ArrowLeft aria-hidden="true" />
              Quay lại
            </Button>
            <Button asChild variant="outline" className="min-h-11">
              <Link to="/portal/workspace">
                <Building2 aria-hidden="true" />
                Đổi workspace
              </Link>
            </Button>
            <Button asChild className="min-h-11">
              <Link to="/portal/dashboard">
                <LayoutDashboard aria-hidden="true" />
                Về tổng quan
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
