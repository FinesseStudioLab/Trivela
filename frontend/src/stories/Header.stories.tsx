// frontend/src/stories/Header.stories.jsx
import Header from '../components/Header.jsx';

export default {
  title: 'Components/Header',
  component: Header,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
};

export const Disconnected = {
  args: { walletAddress: null, isConnecting: false, onConnect: () => alert('connect') },
};

export const Connected = {
  args: {
    walletAddress: 'GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    isConnecting: false,
    onConnect: () => {},
    onDisconnect: () => alert('disconnect'),
  },
};

export const Connecting = {
  args: { walletAddress: null, isConnecting: true, onConnect: () => {} },
};

export const DarkMode = {
  args: { walletAddress: null, isConnecting: false, onConnect: () => {} },
  parameters: { backgrounds: { default: 'dark' } },
};