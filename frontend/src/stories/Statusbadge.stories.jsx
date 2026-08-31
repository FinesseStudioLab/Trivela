import StatusBadge from '../components/StatusBadge.jsx';

export default {
  title: 'Components/StatusBadge',
  component: StatusBadge,
  tags: ['autodocs'],
  argTypes: { status: { control: 'select', options: ['active', 'upcoming', 'ended', 'paused'] } },
};

export const Active = { args: { status: 'active' } };
export const Upcoming = { args: { status: 'upcoming' } };
export const Ended = { args: { status: 'ended' } };
export const Paused = { args: { status: 'paused' } };
export const DarkMode = {
  args: { status: 'active' },
  parameters: { backgrounds: { default: 'dark' } },
};
