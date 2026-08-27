import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { CornerDownLeft, Search, X } from "lucide-react";

export type AdminCommandItem = Readonly<{
  id: string;
  path: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
}>;

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("vi-VN")
    .trim();
}

export function AdminCommandPalette({
  open,
  items: visibleMenuItems,
  onOpenChange,
  onNavigate,
}: {
  open: boolean;
  items: readonly AdminCommandItem[];
  onOpenChange: (open: boolean) => void;
  onNavigate: (path: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const normalizedQuery = normalizeSearch(query);
  const filteredItems = useMemo(
    () =>
      visibleMenuItems.filter((item) => {
        if (!normalizedQuery) return true;
        return normalizeSearch(`${item.label} ${item.path}`).includes(normalizedQuery);
      }),
    [normalizedQuery, visibleMenuItems],
  );

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousActiveElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ) || [],
      ).filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousActiveElement?.focus();
    };
  }, [onOpenChange, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-foreground/35 px-4 pt-[12vh]"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onOpenChange(false);
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-command-title"
        aria-describedby="admin-command-help"
        className="w-full max-w-xl overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl"
      >
        <div className="flex min-h-14 items-center gap-3 border-b border-border px-4">
          <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <label htmlFor="admin-command-input" id="admin-command-title" className="sr-only">
            Đi tới màn hình quản trị
          </label>
          <input
            ref={inputRef}
            id="admin-command-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Đi tới màn hình quản trị..."
            className="min-h-12 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Đóng bảng lệnh"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[min(60vh,28rem)] overflow-y-auto p-2">
          {filteredItems.length ? (
            <ul aria-label="Màn hình được cấp quyền" className="space-y-1">
              {filteredItems.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onNavigate(item.path)}
                      className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        {Icon ? <Icon className="h-4 w-4" /> : <Search className="h-4 w-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{item.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {item.path}
                        </span>
                      </span>
                      <CornerDownLeft
                        className="h-4 w-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-4 py-10 text-center">
              <p className="font-medium text-foreground">Không tìm thấy màn hình phù hợp</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Dữ liệu nghiệp vụ được tìm trong từng danh sách bằng bộ lọc riêng.
              </p>
            </div>
          )}
        </div>

        <div
          id="admin-command-help"
          className="border-t border-border px-4 py-3 text-xs text-muted-foreground"
        >
          Bảng lệnh chỉ điều hướng tới màn hình bạn được cấp quyền.
        </div>
      </section>
    </div>
  );
}
