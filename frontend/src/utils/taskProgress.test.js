import { describe, expect, it } from 'vitest';
import { computeTaskProgress } from './taskProgress';

describe('computeTaskProgress', () => {
  it('returns zeros for missing or invalid input', () => {
    for (const input of [undefined, null, 'tasks', 42, {}]) {
      expect(computeTaskProgress(input)).toEqual({
        total: 0,
        completed: 0,
        remaining: 0,
        percent: 0,
      });
    }
  });

  it('counts completed vs remaining tasks', () => {
    const tasks = [
      { id: 1, completed: true },
      { id: 2, completed: false },
      { id: 3, completed: true },
      { id: 4 },
    ];
    expect(computeTaskProgress(tasks)).toEqual({
      total: 4,
      completed: 2,
      remaining: 2,
      percent: 50,
    });
  });

  it('floors the percentage so 100 means every task is done', () => {
    const tasks = [
      { id: 1, completed: true },
      { id: 2, completed: true },
      { id: 3, completed: false },
    ];
    expect(computeTaskProgress(tasks).percent).toBe(66);
    expect(computeTaskProgress(tasks.map((t) => ({ ...t, completed: true }))).percent).toBe(100);
  });

  it('ignores null entries and treats truthy non-booleans as incomplete', () => {
    const tasks = [null, { id: 1, completed: 'yes' }, { id: 2, completed: true }];
    expect(computeTaskProgress(tasks)).toMatchObject({ total: 2, completed: 1, percent: 50 });
  });
});
