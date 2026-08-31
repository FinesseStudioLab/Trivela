import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createGraphQLHandler } from './graphqlHandler.js';
import { GraphQLSchemaExecutor } from './graphqlSchema.js';

describe('GraphQL Gateway Endpoint (Issue #931)', () => {
  it('executes GraphQL query for campaigns and balances via POST', async () => {
    const handler = createGraphQLHandler();
    const req = {
      method: 'POST',
      body: {
        query: '{ campaigns { id name } balances { address available } }',
      },
    };

    let statusCode = 0;
    let jsonBody = null;

    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonBody = data;
        return this;
      },
      setHeader() {},
    };

    await handler(req, res);

    assert.equal(statusCode, 200);
    assert.ok(jsonBody.data);
    assert.ok(Array.isArray(jsonBody.data.campaigns));
    assert.ok(jsonBody.data.balances);
  });

  it('executes GraphQL query via GET with query string', async () => {
    const handler = createGraphQLHandler();
    const req = {
      method: 'GET',
      query: {
        query: '{ leaderboard { rank points } }',
      },
    };

    let statusCode = 0;
    let jsonBody = null;

    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonBody = data;
        return this;
      },
      setHeader() {},
    };

    await handler(req, res);

    assert.equal(statusCode, 200);
    assert.ok(jsonBody.data);
    assert.ok(Array.isArray(jsonBody.data.leaderboard));
  });

  it('returns 400 when query string is missing', async () => {
    const handler = createGraphQLHandler();
    const req = {
      method: 'POST',
      body: {},
    };

    let statusCode = 0;
    let jsonBody = null;

    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        jsonBody = data;
        return this;
      },
      setHeader() {},
    };

    await handler(req, res);

    assert.equal(statusCode, 400);
    assert.ok(jsonBody.errors);
  });
});
