import '../src/index.css';
import '../src/Landing.css';
import { applyTheme } from '../src/theme';

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
