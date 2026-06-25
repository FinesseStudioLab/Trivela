function o(e) {
  typeof document > 'u' ||
    ((document.documentElement.dataset.theme = e),
    (document.documentElement.style.colorScheme = e));
}
const a = {
    theme: {
      name: 'Theme',
      description: 'Global theme for stories',
      defaultValue: 'dark',
      toolbar: {
        icon: 'contrast',
        showName: !0,
        items: [
          { value: 'dark', title: 'Dark' },
          { value: 'light', title: 'Light' },
        ],
      },
    },
  },
  n = [(e, t) => (o(t.globals.theme || 'dark'), e())],
  r = { controls: { expanded: !0 }, layout: 'centered' };
export { n as decorators, a as globalTypes, r as parameters };
