import ClaimButton from '../components/ClaimButton.jsx';

export default {
  title: 'Components/ClaimButton',
  component: ClaimButton,
  tags: ['autodocs'],
  argTypes: {
    status: {
      control: 'select',
      options: ['ready', 'loading', 'claimed', 'disabled'],
    },
    points: { control: 'number' },
  },
};

export const ReadyToClaim = {
  args: { status: 'ready', points: 150 },
};

export const Loading = {
  args: { status: 'loading', points: 150 },
};

export const Claimed = {
  args: { status: 'claimed', points: 150 },
};

export const Disabled = {
  args: { status: 'disabled', points: 0 },
};
