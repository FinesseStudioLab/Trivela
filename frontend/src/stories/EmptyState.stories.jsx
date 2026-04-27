import EmptyState from '../components/EmptyState';

const meta = {
  title: 'Feedback/EmptyState',
  component: EmptyState,
  args: {
    eyebrow: 'Campaign API',
    title: 'No campaigns yet',
    description:
      'Create a campaign through the backend API and it will show up here once it is saved.',
  },
  argTypes: {
    onAction: { action: 'action clicked' },
  },
};

export default meta;

export const Default = {};

export const Retry = {
  args: {
    eyebrow: 'Campaign API',
    title: 'We could not load campaigns',
    description:
      'The backend did not respond in time. Try the request again once the API is running.',
    actionLabel: 'Try again',
  },
};
