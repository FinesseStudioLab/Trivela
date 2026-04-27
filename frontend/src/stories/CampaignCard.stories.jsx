import CampaignCard from '../components/CampaignCard';

const meta = {
  title: 'Campaigns/CampaignCard',
  component: CampaignCard,
  args: {
    campaign: {
      id: '12',
      name: 'Builder Sprint',
      description:
        'Complete onboarding tasks, submit feedback, and earn points for each milestone.',
      active: true,
      rewardPerAction: 25,
      createdAt: '2026-03-20T09:30:00.000Z',
    },
  },
  parameters: {
    layout: 'padded',
  },
};

export default meta;

export const Active = {};

export const Inactive = {
  args: {
    campaign: {
      id: '13',
      name: 'Archive Campaign',
      description: 'A completed campaign kept around for reporting.',
      active: false,
      rewardPerAction: 10,
      createdAt: '2026-01-10T15:00:00.000Z',
    },
  },
};
