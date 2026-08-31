import Tabs from '../components/ui/Tabs.jsx';

export default {
  title: 'Design System/Tabs',
  component: Tabs,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'Accessible tab strip following the WAI-ARIA Tabs pattern: roving tabindex, arrow-key ' +
          'navigation with wrapping, Home/End, skipped disabled tabs, and automatic or manual ' +
          'activation. Themed entirely through CSS custom properties.',
      },
    },
  },
  argTypes: {
    orientation: { control: 'inline-radio', options: ['horizontal', 'vertical'] },
    activation: { control: 'inline-radio', options: ['automatic', 'manual'] },
    variant: { control: 'inline-radio', options: ['underline', 'pill'] },
    size: { control: 'inline-radio', options: ['sm', 'md'] },
    onChange: { action: 'changed' },
  },
};

const panel = (text) => <p style={{ margin: 0, lineHeight: 1.7 }}>{text}</p>;

const ITEMS = [
  { id: 'overview', label: 'Overview', content: panel('Campaign summary, budget and schedule.') },
  { id: 'rewards', label: 'Rewards', content: panel('Reward tiers, vesting and claim windows.') },
  {
    id: 'audit',
    label: 'Audit',
    content: panel('Every state change with its ledger and tx hash.'),
  },
];

export const Default = {
  args: { items: ITEMS, label: 'Campaign sections' },
};

export const Pills = {
  args: { items: ITEMS, variant: 'pill', label: 'Campaign sections' },
};

export const Vertical = {
  args: { items: ITEMS, orientation: 'vertical', label: 'Campaign sections' },
};

export const WithIconsAndBadges = {
  args: {
    label: 'Operations',
    items: [
      { id: 'queue', label: 'Queue', icon: '⚙️', badge: 12, content: panel('Pending payouts.') },
      { id: 'alerts', label: 'Alerts', icon: '🔔', badge: 3, content: panel('Open alerts.') },
      { id: 'done', label: 'Settled', icon: '✅', content: panel('Settled batches.') },
    ],
  },
};

export const WithDisabledTab = {
  args: {
    label: 'Campaign sections',
    items: [ITEMS[0], { ...ITEMS[1], disabled: true }, ITEMS[2]],
  },
};

/** Manual activation: arrow keys move focus, Enter/Space commits the change. */
export const ManualActivation = {
  args: { items: ITEMS, activation: 'manual', label: 'Campaign sections' },
};

export const SmallPills = {
  args: { items: ITEMS, variant: 'pill', size: 'sm', label: 'Campaign sections' },
};

export const LightTheme = {
  args: { items: ITEMS, label: 'Campaign sections' },
  globals: { theme: 'light' },
};
