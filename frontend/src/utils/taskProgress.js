/**
 * Task progress helpers for the campaign task progress bar (#1223).
 *
 * A task is `{ id, label, completed }`. Input comes from the API, so every
 * field is treated as untrusted: non-array input, null entries and non-boolean
 * `completed` values are tolerated rather than thrown on.
 */

/**
 * @param {Array<{id?: string|number, label?: string, completed?: boolean}>} tasks
 * @returns {{ total: number, completed: number, remaining: number, percent: number }}
 *   `percent` is an integer in [0, 100], floored so 100 only shows when every
 *   task is actually done.
 */
export function computeTaskProgress(tasks) {
  const list = Array.isArray(tasks) ? tasks.filter((t) => t && typeof t === 'object') : [];
  const total = list.length;
  const completed = list.filter((t) => t.completed === true).length;
  const percent = total === 0 ? 0 : Math.floor((completed / total) * 100);
  return { total, completed, remaining: total - completed, percent };
}
