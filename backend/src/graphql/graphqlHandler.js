// @ts-check
import { GraphQLSchemaExecutor } from './graphqlSchema.js';

/**
 * Creates Express request handler for the `/graphql` endpoint.
 * Accepts GET (query params) and POST (JSON body) requests.
 *
 * @param {object} [options]
 * @param {GraphQLSchemaExecutor} [options.executor]
 */
export function createGraphQLHandler(options = {}) {
  const executor = options.executor ?? new GraphQLSchemaExecutor();

  return async (req, res) => {
    let query = '';
    let variables = {};

    if (req.method === 'POST') {
      query = req.body?.query ?? '';
      variables = req.body?.variables ?? {};
    } else if (req.method === 'GET') {
      query = /** @type {string} */ (req.query?.query) ?? '';
      if (typeof req.query?.variables === 'string') {
        try {
          variables = JSON.parse(req.query.variables);
        } catch {
          variables = {};
        }
      }
    } else {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ errors: [{ message: 'Method Not Allowed' }] });
    }

    if (!query) {
      return res.status(400).json({ errors: [{ message: 'Must provide query string' }] });
    }

    const context = {
      user: req.user ?? null,
      userAddress: req.user?.publicKey ?? req.user?.address ?? null,
    };

    const result = await executor.execute(query, variables, context);
    const statusCode = result.errors && !result.data ? 400 : 200;

    return res.status(statusCode).json(result);
  };
}
