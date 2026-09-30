import assert from 'node:assert/strict';
import test, { describe } from 'node:test';
import { createEmbedWidgetRoute } from './embedWidget.js';

const repo = {
  getById: (id) => (id === 'c1' ? { id: 'c1', name: 'Camp <b>', active: true } : null),
};

function run(handler, params, query = {}) {
  const res = {
    headers: {},
    statusCode: 200,
    body: undefined,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(c) {
      this.statusCode = c;
      return this;
    },
    type() {
      return this;
    },
    json(b) {
      this.body = b;
      return this;
    },
    send(b) {
      this.body = b;
      return this;
    },
  };
  handler({ params, query }, res);
  return res;
}

describe('leaderboard embed widget', () => {
  test('renders ranked rows with shortened addresses and escaped names', () => {
    const calls = [];
    const h = createEmbedWidgetRoute(repo, 'https://t.app', {
      getLeaderboard: (id, limit) => {
        calls.push([id, limit]);
        return [
          { address: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234', rank: 1, points: 9 },
          { displayName: '<script>x</script>', rank: 1, points: 9 },
          { address: 'GZZZ', rank: 4, points: 2 },
        ];
      },
    });
    const res = run(h, { widgetType: 'leaderboard', campaignId: 'c1' }, { limit: '3' });
    assert.deepEqual(calls, [['c1', 3]]);
    assert.match(res.body, /GABCD…1234/);
    assert.doesNotMatch(res.body, /GABCDEFGHIJKLMNOPQRSTUVWXYZ1234/);
    assert.doesNotMatch(res.body, /<script>/);
    assert.match(res.body, /Camp &lt;b&gt; Leaderboard/);
    assert.match(res.body, />#4</);
    assert.equal(res.headers['Cache-Control'], 'public, max-age=30');
  });

  test('clamps limit to 50 and defaults to 10', () => {
    const limits = [];
    const h = createEmbedWidgetRoute(repo, 'https://t.app', {
      getLeaderboard: (_id, l) => (limits.push(l), []),
    });
    run(h, { widgetType: 'leaderboard', campaignId: 'c1' }, { limit: '999' });
    run(h, { widgetType: 'leaderboard', campaignId: 'c1' }, {});
    assert.deepEqual(limits, [50, 10]);
  });

  test('empty state and data-source failure both render gracefully', () => {
    const h = createEmbedWidgetRoute(repo, 'https://t.app', {
      getLeaderboard: () => {
        throw new Error('db down');
      },
    });
    const res = run(h, { widgetType: 'leaderboard', campaignId: 'c1' });
    assert.equal(res.statusCode, 200);
    assert.match(res.body, /No participants yet/);
  });

  test('404 for unknown campaign, 400 for unknown widget type', () => {
    const h = createEmbedWidgetRoute(repo, 'https://t.app');
    assert.equal(run(h, { widgetType: 'leaderboard', campaignId: 'nope' }).statusCode, 404);
    assert.equal(run(h, { widgetType: 'bogus', campaignId: 'c1' }).statusCode, 400);
  });
});
