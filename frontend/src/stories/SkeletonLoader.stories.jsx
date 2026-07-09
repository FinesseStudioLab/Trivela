import SkeletonLoader from '../components/SkeletonLoader.jsx';

export default {
  title: 'Components/SkeletonLoader',
  component: SkeletonLoader,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['text', 'card', 'table', 'dashboard'],
    },
    lines: { control: 'number' },
    rows: { control: 'number' },
    label: { control: 'text' },
  },
};

export const Text = {
  args: {
    variant: 'text',
    lines: 3,
    label: 'Loading copy',
  },
};

export const Card = {
  args: {
    variant: 'card',
    label: 'Loading campaign card',
  },
};

export const Table = {
  args: {
    variant: 'table',
    rows: 5,
    label: 'Loading campaign table',
  },
};

export const Dashboard = {
  args: {
    variant: 'dashboard',
    label: 'Loading dashboard metrics',
  },
};
