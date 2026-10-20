import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmailService } from './emailService.js';

test('emailService: isConfigured is false without a transport', () => {
  const svc = createEmailService({});
  assert.equal(svc.isConfigured(), false);
});

test('emailService: send is a no-op when not configured', async () => {
  const svc = createEmailService({ logger: { debug: () => {} } });
  const result = await svc.send({ to: 'a@b.c', subject: 's', text: 't' });
  assert.deepEqual(result, { sent: false, skipped: true });
});

test('emailService: send delegates to the transport when configured', async () => {
  const messages = [];
  const svc = createEmailService({
    transport: async (msg) => {
      messages.push(msg);
    },
  });
  assert.equal(svc.isConfigured(), true);
  const result = await svc.send({ to: 'ops@example.com', subject: 'Hello', text: 'Body' });
  assert.deepEqual(result, { sent: true });
  assert.equal(messages.length, 1);
  assert.equal(messages[0].to, 'ops@example.com');
});
