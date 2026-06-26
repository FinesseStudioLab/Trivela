import { j as r } from './jsx-runtime-Z5uAzocK.js';
import { r as f } from './index-pP6CS22B.js';
import './_commonjsHelpers-Cpj98o6Y.js';
function v(e) {
  if (!e) return '';
  const t = new Date(e);
  return Number.isNaN(t.getTime())
    ? ''
    : new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(t);
}
function h({ campaign: e }) {
  const t = f.useId(),
    d = v(e == null ? void 0 : e.createdAt),
    u = (e == null ? void 0 : e.rewardPerAction) ?? 0,
    x = (e == null ? void 0 : e.description) || 'No campaign description has been added yet.',
    i = (e == null ? void 0 : e.active) !== !1;
  return r.jsxs('article', {
    className: 'campaign-card',
    'aria-labelledby': t,
    children: [
      r.jsxs('div', {
        className: 'campaign-card-header',
        children: [
          r.jsxs('div', {
            children: [
              r.jsxs('p', {
                className: 'campaign-card-eyebrow',
                children: ['Campaign #', (e == null ? void 0 : e.id) || '—'],
              }),
              r.jsx('h3', {
                id: t,
                className: 'campaign-card-title',
                children: (e == null ? void 0 : e.name) || 'Untitled campaign',
              }),
            ],
          }),
          r.jsx('span', {
            className: `campaign-badge ${i ? 'campaign-badge-active' : 'campaign-badge-inactive'}`,
            children: i ? 'Active' : 'Inactive',
          }),
        ],
      }),
      r.jsx('p', { className: 'campaign-card-description', children: x }),
      r.jsxs('dl', {
        className: 'campaign-card-metadata',
        children: [
          r.jsxs('div', {
            className: 'campaign-card-metadata-item',
            children: [
              r.jsx('dt', { children: 'Reward' }),
              r.jsxs('dd', { children: [u, ' pts'] }),
            ],
          }),
          d &&
            r.jsxs('div', {
              className: 'campaign-card-metadata-item',
              children: [r.jsx('dt', { children: 'Created' }), r.jsx('dd', { children: d })],
            }),
        ],
      }),
    ],
  });
}
h.__docgenInfo = { description: '', methods: [], displayName: 'CampaignCard' };
const C = {
    title: 'Campaigns/CampaignCard',
    component: h,
    args: {
      campaign: {
        id: '12',
        name: 'Builder Sprint',
        description:
          'Complete onboarding tasks, submit feedback, and earn points for each milestone.',
        active: !0,
        rewardPerAction: 25,
        createdAt: '2026-03-20T09:30:00.000Z',
      },
    },
    parameters: { layout: 'padded' },
  },
  a = {},
  s = {
    args: {
      campaign: {
        id: '13',
        name: 'Archive Campaign',
        description: 'A completed campaign kept around for reporting.',
        active: !1,
        rewardPerAction: 10,
        createdAt: '2026-01-10T15:00:00.000Z',
      },
    },
  };
var n, c, o;
a.parameters = {
  ...a.parameters,
  docs: {
    ...((n = a.parameters) == null ? void 0 : n.docs),
    source: {
      originalSource: '{}',
      ...((o = (c = a.parameters) == null ? void 0 : c.docs) == null ? void 0 : o.source),
    },
  },
};
var m, l, p;
s.parameters = {
  ...s.parameters,
  docs: {
    ...((m = s.parameters) == null ? void 0 : m.docs),
    source: {
      originalSource: `{
  args: {
    campaign: {
      id: '13',
      name: 'Archive Campaign',
      description: 'A completed campaign kept around for reporting.',
      active: false,
      rewardPerAction: 10,
      createdAt: '2026-01-10T15:00:00.000Z'
    }
  }
}`,
      ...((p = (l = s.parameters) == null ? void 0 : l.docs) == null ? void 0 : p.source),
    },
  },
};
const b = ['Active', 'Inactive'];
export { a as Active, s as Inactive, b as __namedExportsOrder, C as default };
