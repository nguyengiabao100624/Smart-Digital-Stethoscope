import React from "react";

export const ADMIN_TABLE_PAGE_SIZE = 10;

export function paginateItems<T>(items: T[], page: number, pageSize = ADMIN_TABLE_PAGE_SIZE) {
  const safePage = Math.max(1, page);
  const start = (safePage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

function getPageItems(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  return Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
}

export function PaginationFooter({
  page,
  pageSize = ADMIN_TABLE_PAGE_SIZE,
  totalItems,
  sourceTotalItems,
  itemLabel,
  onPageChange,
}: {
  page: number;
  pageSize?: number;
  totalItems: number;
  sourceTotalItems?: number;
  itemLabel: string;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(safePage * pageSize, totalItems);
  const pageItems = getPageItems(safePage, totalPages);

  return (
    <div className="p-4 border-t border-border flex flex-col gap-3 text-sm text-muted-foreground mt-auto bg-muted/10 sm:flex-row sm:items-center sm:justify-between">
      <div>
        Hiển thị {start}-{end} trong số {totalItems} {itemLabel}
        {sourceTotalItems !== undefined && sourceTotalItems !== totalItems
          ? ` (lọc từ ${sourceTotalItems})`
          : ""}
      </div>
      <div className="flex flex-wrap gap-1">
        <button
          onClick={() => onPageChange(safePage - 1)}
          disabled={safePage <= 1}
          className="px-3 py-1 border border-border rounded bg-card hover:bg-muted disabled:opacity-50 disabled:hover:bg-card"
        >
          Trước
        </button>
        {pageItems.map((pageNumber, index) => {
          const previous = pageItems[index - 1];
          const showEllipsis = previous !== undefined && pageNumber - previous > 1;

          return (
            <React.Fragment key={pageNumber}>
              {showEllipsis && <span className="px-2 py-1">...</span>}
              <button
                onClick={() => onPageChange(pageNumber)}
                className={
                  pageNumber === safePage
                    ? "px-3 py-1 border border-border rounded bg-primary text-primary-foreground"
                    : "px-3 py-1 border border-border rounded bg-card hover:bg-muted"
                }
              >
                {pageNumber}
              </button>
            </React.Fragment>
          );
        })}
        <button
          onClick={() => onPageChange(safePage + 1)}
          disabled={safePage >= totalPages}
          className="px-3 py-1 border border-border rounded bg-card hover:bg-muted disabled:opacity-50 disabled:hover:bg-card"
        >
          Sau
        </button>
      </div>
    </div>
  );
}
