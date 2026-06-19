import CampaignCard from '../components/CampaignCard.jsx';

export default {
  title: 'Components/CampaignCard',
  component: CampaignCard,
  tags: ['autodocs'],
  argTypes: {
    campaign: { control: 'object' },
    loading: { control: 'boolean' },
  },
};

const baseCampaign = {
  id: '1',
  name: 'Summer DeFi Rewards',
  slug: 'summer-defi-rewards',
  description: 'Earn points for swapping on our DEX every day this summer.',
  active: true,
  featured: false,
  rewardPerAction: 25,
  status: 'active',
  startDate: '2026-06-01',
  endDate: '2026-08-31',
  tags: ['defi', 'swap'],
  category: 'DeFi',
  imageUrl: null,
};

export const Active = { args: { campaign: baseCampaign } };

export const Featured = {
  args: { campaign: { ...baseCampaign, featured: true, name: 'Featured Airdrop Campaign' } },
};

export const Inactive = {
  args: { campaign: { ...baseCampaign, active: false, status: 'ended', name: 'Ended Campaign' } },
};

export const Upcoming = {
  args: {
    campaign: {
      ...baseCampaign,
      status: 'upcoming',
      startDate: '2027-01-01',
      name: 'Upcoming Campaign',
    },
  },
};

export const WithImage = {
  args: {
    campaign: {
      ...baseCampaign,
      imageUrl: 'https://via.placeholder.com/400x200?text=Campaign+Banner',
    },
  },
};

export const LoadingSkeleton = { args: { campaign: baseCampaign, loading: true } };

export const DarkMode = {
  args: { campaign: { ...baseCampaign, featured: true } },
  parameters: { backgrounds: { default: 'dark' } },
};
