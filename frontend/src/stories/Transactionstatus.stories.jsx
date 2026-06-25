// frontend/src/stories/TransactionStatus.stories.jsx
import TransactionStatus from '../components/TransactionStatus.jsx';

export default {
  title: 'Components/TransactionStatus',
  component: TransactionStatus,
  tags: ['autodocs'],
};

export const Pending = { args: { status: 'pending', txHash: null } };
export const Success = {
  args: {
    status: 'success',
    txHash: 'abc123def456abc123def456abc123def456abc123def456abc123def456',
  },
};
export const Failed = {
  args: { status: 'failed', error: 'Transaction rejected by network', txHash: null },
};
export const DarkMode = {
  args: { status: 'success', txHash: 'abc123' },
  parameters: { backgrounds: { default: 'dark' } },
};
