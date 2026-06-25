import { j as e } from './jsx-runtime-Z5uAzocK.js';
import './index-pP6CS22B.js';
import './_commonjsHelpers-Cpj98o6Y.js';
function g(a) {
  return a ? (a.length <= 14 ? a : `${a.slice(0, 6)}...${a.slice(-4)}`) : '';
}
const f = [
  { href: 'https://github.com/FinesseStudioLab/Trivela', label: 'GitHub' },
  { href: 'https://github.com/FinesseStudioLab/Trivela/issues', label: 'Contribute' },
  { href: 'https://developers.stellar.org/docs', label: 'Stellar' },
];
function u({ theme: a = 'dark', onToggleTheme: h, walletAddress: l = '' }) {
  const p = a === 'dark' ? 'light' : 'dark';
  return e.jsx('header', {
    className: 'site-header',
    children: e.jsxs('nav', {
      className: 'nav',
      'aria-label': 'Primary',
      children: [
        e.jsxs('a', {
          href: '/',
          className: 'nav-logo',
          'aria-label': 'Trivela home',
          children: [
            e.jsx('span', { className: 'nav-logo-icon', 'aria-hidden': 'true', children: '◇' }),
            'Trivela',
          ],
        }),
        e.jsxs('div', {
          className: 'nav-actions',
          children: [
            e.jsx('div', {
              className: 'nav-links',
              children: f.map((t) =>
                e.jsx(
                  'a',
                  { href: t.href, target: '_blank', rel: 'noopener noreferrer', children: t.label },
                  t.href,
                ),
              ),
            }),
            e.jsxs('div', {
              className: 'nav-utilities',
              children: [
                l &&
                  e.jsxs('p', {
                    className: 'nav-wallet',
                    'aria-live': 'polite',
                    children: [
                      e.jsx('span', { className: 'nav-wallet-label', children: 'Wallet' }),
                      e.jsx('span', { className: 'nav-wallet-value', children: g(l) }),
                    ],
                  }),
                e.jsxs('button', {
                  type: 'button',
                  className: 'btn btn-secondary btn-button theme-toggle',
                  onClick: h,
                  'aria-label': `Switch to ${p} theme`,
                  children: [
                    e.jsx('span', {
                      className: 'theme-toggle-label',
                      children: a === 'dark' ? 'Light mode' : 'Dark mode',
                    }),
                    e.jsx('span', {
                      className: 'theme-toggle-state',
                      'aria-hidden': 'true',
                      children: a,
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  });
}
u.__docgenInfo = {
  description: '',
  methods: [],
  displayName: 'Header',
  props: {
    theme: { defaultValue: { value: "'dark'", computed: !1 }, required: !1 },
    walletAddress: { defaultValue: { value: "''", computed: !1 }, required: !1 },
  },
};
const N = {
    title: 'Layout/Header',
    component: u,
    args: { theme: 'dark', walletAddress: '' },
    argTypes: { onToggleTheme: { action: 'theme toggled' } },
    parameters: { layout: 'fullscreen' },
  },
  r = {},
  s = { args: { walletAddress: 'GCFX4Q2PEYXXJ5U4VJ4FMOCK4DD7PWLN4S7L4WALLETX3KM' } };
var n, o, i;
r.parameters = {
  ...r.parameters,
  docs: {
    ...((n = r.parameters) == null ? void 0 : n.docs),
    source: {
      originalSource: '{}',
      ...((i = (o = r.parameters) == null ? void 0 : o.docs) == null ? void 0 : i.source),
    },
  },
};
var c, d, m;
s.parameters = {
  ...s.parameters,
  docs: {
    ...((c = s.parameters) == null ? void 0 : c.docs),
    source: {
      originalSource: `{
  args: {
    walletAddress: 'GCFX4Q2PEYXXJ5U4VJ4FMOCK4DD7PWLN4S7L4WALLETX3KM'
  }
}`,
      ...((m = (d = s.parameters) == null ? void 0 : d.docs) == null ? void 0 : m.source),
    },
  },
};
const j = ['Default', 'ConnectedWallet'];
export { s as ConnectedWallet, r as Default, j as __namedExportsOrder, N as default };
