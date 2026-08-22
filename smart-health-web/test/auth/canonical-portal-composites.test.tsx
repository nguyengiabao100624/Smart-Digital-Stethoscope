import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "../../src/components/ui/button";
import { DataTableShell } from "../../src/components/ui/data-table-shell";
import { FilterBar } from "../../src/components/ui/filter-bar";
import { PageHeader } from "../../src/components/ui/page-header";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  PermissionState,
} from "../../src/components/ui/state-surface";
import { StatusBadge } from "../../src/components/ui/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "../../src/components/ui/table";

describe("canonical Portal composite components", () => {
  it("provides one labelled responsive header and filter surface with 44px actions", () => {
    render(
      <>
        <PageHeader
          title="Lượt đo"
          description="Dữ liệu workspace"
          actions={<Button>Xuất dữ liệu</Button>}
        />
        <FilterBar aria-label="Lọc lượt đo" title="Bộ lọc">
          <label htmlFor="query">Từ khóa</label>
          <input id="query" />
          <Button type="submit">Tìm kiếm</Button>
        </FilterBar>
      </>,
    );

    const heading = screen.getByRole("heading", { level: 1, name: "Lượt đo" });
    expect(heading.closest('[data-ui="page-header"]')).toHaveAttribute(
      "aria-labelledby",
      heading.id,
    );
    expect(heading.closest('[data-ui="page-header"]')).toHaveClass(
      "sm:flex-row",
    );

    const filter = screen.getByRole("form", { name: "Lọc lượt đo" });
    expect(filter).toHaveClass("bg-card", "text-card-foreground");
    expect(filter.className).toContain("[&_button]:min-h-11");
    expect(screen.getByLabelText("Từ khóa")).toBeVisible();
  });

  it("exposes a keyboard-focusable horizontal table region", () => {
    render(
      <DataTableShell label="Danh sách lượt đo">
        <Table>
          <TableBody>
            <TableRow>
              <TableCell>Lượt đo 01</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </DataTableShell>,
    );

    const region = screen.getByRole("region", { name: "Danh sách lượt đo" });
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region).toHaveAttribute("data-responsive", "horizontal-scroll");
    expect(region).toHaveClass("overflow-x-auto", "focus-visible:ring-2");
    expect(region.parentElement).toHaveClass(
      "max-w-full",
      "bg-card",
      "text-card-foreground",
    );
  });

  it("maps statuses to theme-safe semantic tokens instead of raw colors", () => {
    render(<StatusBadge tone="success">Hoàn tất</StatusBadge>);

    const badge = screen.getByText("Hoàn tất");
    expect(badge).toHaveAttribute("data-ui", "status-badge");
    expect(badge).toHaveAttribute("data-tone", "success");
    expect(badge.className).toContain("var(--status-success-bg)");
    expect(badge.className).toContain("var(--status-success-fg)");
  });

  it("covers loading, empty, error retry and permission states", () => {
    const retry = vi.fn();
    const { rerender } = render(
      <LoadingState label="Đang tải lượt đo" rows={2} />,
    );

    expect(
      screen.getByRole("status", { name: "Đang tải lượt đo" }),
    ).toHaveAttribute("aria-busy", "true");

    rerender(
      <EmptyState title="Chưa có lượt đo" description="Hãy thử bộ lọc khác." />,
    );
    expect(screen.getByRole("status")).toHaveAttribute("data-state", "empty");
    expect(
      screen.getByRole("heading", { name: "Chưa có lượt đo" }),
    ).toBeVisible();

    rerender(
      <ErrorState
        title="Không thể tải"
        error={new Error("Mất kết nối")}
        retry={retry}
      />,
    );
    expect(screen.getByRole("alert")).toHaveAttribute("data-state", "error");
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(retry).toHaveBeenCalledOnce();

    rerender(<PermissionState />);
    expect(screen.getByRole("alert")).toHaveAttribute(
      "data-state",
      "permission",
    );
    expect(screen.getByText("Bạn chưa có quyền truy cập")).toBeVisible();
  });
});
