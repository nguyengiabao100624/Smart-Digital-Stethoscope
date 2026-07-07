export const ADMIN_TABLE_PAGE_SIZE = 10;

export function paginateItems<T>(items: T[], page: number, pageSize = ADMIN_TABLE_PAGE_SIZE) {
  const safePage = Math.max(1, page);
  const start = (safePage - 1) * pageSize;
  return items.slice(start, start + pageSize);
}
