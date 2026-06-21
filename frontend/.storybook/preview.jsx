import '../src/index.css';
import '../src/Landing.css';
import { applyTheme } from '../src/theme';
import { MemoryRouter } from 'react-router-dom';

export const globalTypes = {
  theme: {
    name: 'Theme',
    description: 'Global theme for stories',
    defaultValue: 'dark',
    toolbar: {
      icon: 'contrast',
      showName: true,
      items: [
        { value: 'dark', title: 'Dark' },
        { value: 'light', title: 'Light' },
      ],
    },
  },
};

export const decorators = [
  // Provide Router context for all stories (required by components using Link, useLocation, etc.)
  (Story) => (
    <MemoryRouter initialEntries={['/']}>
      <Story />
    </MemoryRouter>
  ),
  // Theme decorator
  (Story, context) => {
    applyTheme(context.globals.theme || 'dark');
    return Story();
  },
];

export const parameters = {
  controls: {
    expanded: true,
  },
  layout: 'centered',
};
