const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

function parsePositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseNonNegativeInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function paginateItems(items, query = {}) {
  const total = items.length;
  const requestedLimit = parsePositiveInt(query.limit);
  const limit = Math.min(requestedLimit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const requestedOffset = parseNonNegativeInt(query.offset);
  const requestedPage = parsePositiveInt(query.page);

  const offset = requestedOffset ?? ((requestedPage ?? 1) - 1) * limit;
  const page = requestedPage ?? Math.floor(offset / limit) + 1;
  const data = items.slice(offset, offset + limit);
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
  const hasPreviousPage = offset > 0;
  const hasNextPage = offset + data.length < total;

  return {
    data,
    pagination: {
      total,
      count: data.length,
      page,
      limit,
      offset,
      totalPages,
      hasPreviousPage,
      hasNextPage,
      previousPage: hasPreviousPage ? Math.max(page - 1, 1) : null,
      nextPage: hasNextPage ? page + 1 : null,
    },
  };
}
