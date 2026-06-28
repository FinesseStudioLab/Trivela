import { j as e } from './jsx-runtime-Z5uAzocK.js';
import './index-pP6CS22B.js';
import './_commonjsHelpers-Cpj98o6Y.js';
function l({
  eyebrow: m = 'Nothing here yet',
  title: u,
  description: y,
  actionLabel: n = '',
  onAction: r,
}) {
  return e.jsxs('div', {
    className: 'empty-state',
    role: 'status',
    'aria-live': 'polite',
    children: [
      e.jsx('p', { className: 'empty-state-eyebrow', children: m }),
      e.jsx('h3', { className: 'empty-state-title', children: u }),
      e.jsx('p', { className: 'empty-state-copy', children: y }),
      n &&
        r &&
        e.jsx('button', {
          type: 'button',
          className: 'btn btn-secondary btn-button empty-state-action',
          onClick: r,
          children: n,
        }),
    ],
  });
}
l.__docgenInfo = {
  description: '',
  methods: [],
  displayName: 'EmptyState',
  props: {
    eyebrow: { defaultValue: { value: "'Nothing here yet'", computed: !1 }, required: !1 },
    actionLabel: { defaultValue: { value: "''", computed: !1 }, required: !1 },
  },
};
const f = {
    title: 'Feedback/EmptyState',
    component: l,
    args: {
      eyebrow: 'Campaign API',
      title: 'No campaigns yet',
      description:
        'Create a campaign through the backend API and it will show up here once it is saved.',
    },
    argTypes: { onAction: { action: 'action clicked' } },
  },
  t = {},
  a = {
    args: {
      eyebrow: 'Campaign API',
      title: 'We could not load campaigns',
      description:
        'The backend did not respond in time. Try the request again once the API is running.',
      actionLabel: 'Try again',
    },
  };
var s, o, i;
t.parameters = {
  ...t.parameters,
  docs: {
    ...((s = t.parameters) == null ? void 0 : s.docs),
    source: {
      originalSource: '{}',
      ...((i = (o = t.parameters) == null ? void 0 : o.docs) == null ? void 0 : i.source),
    },
  },
};
var c, p, d;
a.parameters = {
  ...a.parameters,
  docs: {
    ...((c = a.parameters) == null ? void 0 : c.docs),
    source: {
      originalSource: `{
  args: {
    eyebrow: 'Campaign API',
    title: 'We could not load campaigns',
    description: 'The backend did not respond in time. Try the request again once the API is running.',
    actionLabel: 'Try again'
  }
}`,
      ...((d = (p = a.parameters) == null ? void 0 : p.docs) == null ? void 0 : d.source),
    },
  },
};
const x = ['Default', 'Retry'];
export { t as Default, a as Retry, x as __namedExportsOrder, f as default };
