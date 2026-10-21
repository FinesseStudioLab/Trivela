import { computeTaskProgress } from '../utils/taskProgress';
import './TaskProgressBar.css';

/**
 * TaskProgressBar — completed vs remaining tasks required to unlock a
 * campaign's reward, with a percentage indicator (#1223).
 *
 * Renders nothing when there are no tasks, so campaigns without task data are
 * unaffected.
 *
 * @param {Array<{id: string|number, label?: string, completed?: boolean}>} tasks
 * @param {string} [title='Reward progress']
 * @param {boolean} [showTaskList=true] - also list each task with its state.
 */
export default function TaskProgressBar({ tasks, title = 'Reward progress', showTaskList = true }) {
  const { total, completed, remaining, percent } = computeTaskProgress(tasks);
  if (total === 0) return null;

  const unlocked = remaining === 0;
  const items = tasks.filter((t) => t && typeof t === 'object');

  return (
    <section className="task-progress" aria-label={title} data-testid="task-progress">
      <div className="task-progress-header">
        <h3 className="task-progress-title">{title}</h3>
        <span className="task-progress-percent" data-testid="task-progress-percent">
          {percent}%
        </span>
      </div>

      <div
        className="task-progress-bar"
        role="progressbar"
        aria-valuenow={completed}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuetext={`${completed} of ${total} tasks complete`}
      >
        <div
          className={`task-progress-fill${unlocked ? ' task-progress-fill--done' : ''}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <p className="task-progress-summary" aria-live="polite">
        {unlocked
          ? 'All tasks complete — reward unlocked!'
          : `${completed} of ${total} tasks complete · ${remaining} remaining to unlock the reward`}
      </p>

      {showTaskList && (
        <ul className="task-progress-list">
          {items.map((task, index) => {
            const done = task.completed === true;
            return (
              <li
                key={task.id ?? index}
                className={`task-progress-item${done ? ' task-progress-item--done' : ''}`}
              >
                <span className="task-progress-check" aria-hidden="true">
                  {done ? '✓' : '○'}
                </span>
                <span>{task.label || `Task ${index + 1}`}</span>
                <span className="sr-only">{done ? ' (completed)' : ' (remaining)'}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
