import React from "react";
import { useLocation } from "@/components/admin/router-shim";

export function Placeholder() {
  const location = useLocation();
  const pathName = location.pathname.replace("/", "").replace("-", " ");

  return (
    <div className="flex flex-col items-center justify-center h-[60vh] bg-card rounded-lg border border-border shadow-sm p-8">
      <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
        <svg
          className="w-8 h-8 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
          />
        </svg>
      </div>
      <h2 className="text-xl font-medium text-foreground capitalize mb-2">Chức năng {pathName}</h2>
      <p className="text-muted-foreground text-center max-w-md">
        Màn hình này đang trong quá trình phát triển. Vui lòng quay lại sau hoặc truy cập các tính
        năng chính ở menu bên trái.
      </p>
    </div>
  );
}
