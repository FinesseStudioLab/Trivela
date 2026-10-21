import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createProbeHandlers } from '../middleware/probes.js';

describe('Kubernetes Health Probes (Issue #928)', () => {
  it('livenessHandler returns 200 live: true', () => {
    const { livenessHandler } = createProbeHandlers();
    let status = 0;
    let jsonBody = null;

    const res = {
      status(s) {
        status = s;
        return this;
      },
      json(b) {
        jsonBody = b;
        return this;
      },
    };

    livenessHandler({}, res);

    assert.equal(status, 200);
    assert.deepEqual(jsonBody, { status: 'ok', live: true });
  });

  it('readinessHandler returns 200 ready: true when not shutting down', () => {
    const { readinessHandler } = createProbeHandlers({ getIsShuttingDown: () => false });
    let status = 0;
    let jsonBody = null;

    const res = {
      status(s) {
        status = s;
        return this;
      },
      json(b) {
        jsonBody = b;
        return this;
      },
    };

    readinessHandler({}, res);

    assert.equal(status, 200);
    assert.deepEqual(jsonBody, { status: 'ok', ready: true });
  });

  it('readinessHandler returns 503 ready: false when shutting down', () => {
    const { readinessHandler } = createProbeHandlers({ getIsShuttingDown: () => true });
    let status = 0;
    let jsonBody = null;

    const res = {
      status(s) {
        status = s;
        return this;
      },
      json(b) {
        jsonBody = b;
        return this;
      },
    };

    readinessHandler({}, res);

    assert.equal(status, 503);
    assert.deepEqual(jsonBody, { status: 'shutting_down', ready: false });
  });
});
