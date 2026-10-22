import RewardBadge from '../components/RewardBadge.jsx';

export default {
  title: 'Components/RewardBadge',
  component: RewardBadge,
  tags: ['autodocs'],
  argTypes: {
    points: { control: 'number' },
    label: { control: 'text' },
    variant: { control: 'select', options: ['default', 'success', 'warning', 'claimed'] },
    size: { control: 'select', options: ['small', 'medium', 'large'] },
  },
};

export const Default = {
  args: { points: 50, label: 'pts', variant: 'default', size: 'medium' },
};

export const Success = {
  args: { points: 100, label: 'pts', variant: 'success', size: 'medium' },
};

export const Warning = {
  args: { points: 25, label: 'pts', variant: 'warning', size: 'medium' },
};

export const Claimed = {
  args: { points: 200, label: 'pts', variant: 'claimed', size: 'medium' },
};

export const Small = {
  args: { points: 10, label: 'pts', variant: 'default', size: 'small' },
};

export const Large = {
  args: { points: 500, label: 'pts', variant: 'success', size: 'large' },
};
