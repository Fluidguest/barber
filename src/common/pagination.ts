/**
 * Paginação opt-in e reutilizável.
 * - Sem `page` → retorna array (compatível com consumidores que usam a lista
 *   como referência, ex.: dropdowns).
 * - Com `page` → retorna envelope { items, total, page, pageSize, totalPages }.
 */
export interface PageParams {
  page?: number;
  pageSize?: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function pageArgs(p: PageParams, defaultSize = 50, maxSize = 200) {
  const rawPage = Number(p.page);
  const paginate = Number.isFinite(rawPage) && rawPage >= 1;
  const rawSize = Number(p.pageSize);
  const pageSize = Math.min(
    Math.max(Number.isFinite(rawSize) ? rawSize : defaultSize, 1),
    maxSize,
  );
  const page = paginate ? Math.floor(rawPage) : 1;
  return {
    paginate,
    page,
    pageSize,
    skip: paginate ? (page - 1) * pageSize : 0,
    take: pageSize,
  };
}

export function buildPage<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): Page<T> {
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
