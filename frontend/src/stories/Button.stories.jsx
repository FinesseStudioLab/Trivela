import Button from '../components/ui/Button.jsx';

export default {
  title: 'Design System/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['primary', 'secondary', 'danger', 'ghost'],
      description: 'Visual style of the button',
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'Size of the button',
    },
    loading: {
      control: 'boolean',
      description: 'Shows a spinner and disables interaction',
    },
    disabled: {
      control: 'boolean',
      description: 'Disables the button',
    },
    fullWidth: {
      control: 'boolean',
      description: 'Stretches the button to fill its container',
    },
    children: {
      control: 'text',
      description: 'Button label',
    },
  },
};

// — variants —
export const Primary = {
  args: { variant: 'primary', children: 'Primary' },
};

export const Secondary = {
  args: { variant: 'secondary', children: 'Secondary' },
};

export const Danger = {
  args: { variant: 'danger', children: 'Danger' },
};

export const Ghost = {
  args: { variant: 'ghost', children: 'Ghost' },
};

// — sizes —
export const Small = {
  args: { variant: 'primary', size: 'sm', children: 'Small' },
};

export const Medium = {
  args: { variant: 'primary', size: 'md', children: 'Medium' },
};

export const Large = {
  args: { variant: 'primary', size: 'lg', children: 'Large' },
};

// — states —
export const Disabled = {
  args: { variant: 'primary', disabled: true, children: 'Disabled' },
};

export const Loading = {
  args: { variant: 'primary', loading: true, children: 'Saving…' },
};

export const FullWidth = {
  args: { variant: 'primary', fullWidth: true, children: 'Full Width' },
};

// — all variants at once —
export const AllVariants = {
  render: () => (
    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="danger">Danger</Button>
      <Button variant="ghost">Ghost</Button>
    </div>
  ),
};

// — all sizes at once —
export const AllSizes = {
  render: () => (
    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
      <Button variant="primary" size="sm">Small</Button>
      <Button variant="primary" size="md">Medium</Button>
      <Button variant="primary" size="lg">Large</Button>
    </div>
  ),
};

// — dark mode —
export const DarkMode = {
  args: { variant: 'primary', children: 'Dark Mode' },
  parameters: { backgrounds: { default: 'dark' } },
};