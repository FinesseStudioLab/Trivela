import EmptyState from '../components/EmptyState.jsx';

export default {
  title: 'Components/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
  argTypes: { onAction: { action: 'actionClicked' } },
};

export const NoCampaigns = {
  args: {
    eyebrow: 'No campaigns yet',
    title: 'Nothing here yet',
    description: 'Create your first campaign to start rewarding your community.',
    actionLabel: 'Create campaign',
    onAction: () => {},
  },
};

export const SearchNoResults = {
  args: {
    eyebrow: 'No results',
    title: 'No campaigns match your search',
    description: 'Try adjusting your filters or search terms.',
    actionLabel: 'Clear filters',
    onAction: () => {},
  },
};

export const WithoutAction = {
  args: {
    eyebrow: 'All done',
    title: 'Nothing to show',
    description: 'Check back later.',
    actionLabel: '',
  },
};

export const DarkMode = {
  args: {
    eyebrow: 'No campaigns',
    title: 'Nothing here yet',
    description: 'Get started by creating a campaign.',
    actionLabel: 'Create campaign',
    onAction: () => {},
  },
  parameters: { backgrounds: { default: 'dark' } },
};
