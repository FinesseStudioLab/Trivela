import Header from '../components/Header';

const meta = {
  title: 'Layout/Header',
  component: Header,
  args: {
    theme: 'dark',
    walletAddress: '',
  },
  argTypes: {
    onToggleTheme: { action: 'theme toggled' },
    onConnectWallet: { action: 'connect wallet' },
    onDisconnectWallet: { action: 'disconnect wallet' },
  },
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;

export const Default = {};

export const ConnectedWallet = {
  args: {
    walletAddress: 'GCFX4Q2PEYXXJ5U4VJ4FMOCK4DD7PWLN4S7L4WALLETX3KM',
    walletBalance: '142.50 XLM',
  },
};
