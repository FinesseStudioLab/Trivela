import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import TaskProgressBar from './TaskProgressBar';

const TASKS = [
  { id: 'follow', label: 'Follow on X', completed: true },
  { id: 'join', label: 'Join Discord', completed: false },
  { id: 'share', label: 'Share campaign', completed: false },
  { id: 'register', label: 'Register wallet', completed: true },
];

describe('TaskProgressBar', () => {
  it('renders nothing when there are no tasks', () => {
    const { container } = render(<TaskProgressBar tasks={[]} />);
    expect(container).toBeEmptyDOMElement();
    const { container: c2 } = render(<TaskProgressBar tasks={undefined} />);
    expect(c2).toBeEmptyDOMElement();
  });

  it('shows the completion percentage and an accessible progressbar', () => {
    render(<TaskProgressBar tasks={TASKS} />);
    expect(screen.getByTestId('task-progress-percent')).toHaveTextContent('50%');
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '2');
    expect(bar).toHaveAttribute('aria-valuemax', '4');
    expect(bar).toHaveAttribute('aria-valuetext', '2 of 4 tasks complete');
    expect(screen.getByText(/2 remaining to unlock the reward/)).toBeInTheDocument();
  });

  it('lists each task with its state', () => {
    render(<TaskProgressBar tasks={TASKS} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByText('Join Discord')).toBeInTheDocument();
    expect(screen.getAllByText('(completed)', { exact: false })).toHaveLength(2);
  });

  it('announces the unlock when every task is complete', () => {
    render(<TaskProgressBar tasks={TASKS.map((t) => ({ ...t, completed: true }))} />);
    expect(screen.getByTestId('task-progress-percent')).toHaveTextContent('100%');
    expect(screen.getByText(/reward unlocked/i)).toBeInTheDocument();
  });

  it('can hide the task list', () => {
    render(<TaskProgressBar tasks={TASKS} showTaskList={false} />);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
