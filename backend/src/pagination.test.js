import test from 'node:test';
import assert from 'node:assert/strict';
import { paginateItems } from './pagination.js';

const campaigns = Array.from({ length: 25 }, (_, index) => ({
  id: String(index + 1),
  name: `Campaign ${index + 1}`,
}));

test('paginateItems supports page and limit queries', () => {
  const result = paginateItems(campaigns, { page: '2', limit: '10' });

  assert.equal(result.data.length, 10);
  assert.equal(result.data[0].id, '11');
  assert.deepEqual(result.pagination, {
    total: 25,
    count: 10,
    page: 2,
    limit: 10,
    offset: 10,
    totalPages: 3,
    hasPreviousPage: true,
    hasNextPage: true,
    previousPage: 1,
    nextPage: 3,
  });
});

test('paginateItems supports offset and limit queries', () => {
  const result = paginateItems(campaigns, { offset: '20', limit: '4' });

  assert.equal(result.data.length, 4);
  assert.equal(result.data[0].id, '21');
  assert.equal(result.pagination.page, 6);
  assert.equal(result.pagination.previousPage, 5);
  assert.equal(result.pagination.nextPage, 7);
});

test('paginateItems falls back to safe defaults for invalid input', () => {
  const result = paginateItems(campaigns, { page: '0', limit: '-1', offset: '-5' });

  assert.equal(result.data.length, 10);
  assert.equal(result.pagination.page, 1);
  assert.equal(result.pagination.limit, 10);
  assert.equal(result.pagination.offset, 0);
});
