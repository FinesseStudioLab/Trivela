import helmet from 'helmet';

const SOROBAN_RPC_URLS = process.env.SOROBAN_RPC_URLS || '';
const HORIZON_URL = process.env.HORIZON_URL || '';

const connectSrcUrls = ["'self'"]
  .concat(SOROBAN_RPC_URLS.split(',').filter(Boolean))
  .concat(HORIZON_URL ? [HORIZON_URL] : [])
  .join(' ');

const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: connectSrcUrls.split(' '),
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
    },
  },
  hsts: {
    maxAge: 15552000,
    includeSubDomains: true,
    preload: false,
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  frameguard: { action: 'deny' },
  noSniff: true,
  dnsPrefetchControl: { allow: false },
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
});

const embedHelmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      connectSrc: connectSrcUrls.split(' '),
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      frameAncestors: ['*'],
    },
  },
  hsts: {
    maxAge: 15552000,
    includeSubDomains: true,
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  frameguard: false,
  noSniff: true,
  dnsPrefetchControl: { allow: false },
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
});

export default function securityHeaders(req, res, next) {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  const isEmbedRoute = req.path.startsWith('/embed/');
  const middleware = isEmbedRoute ? embedHelmetMiddleware : helmetMiddleware;

  middleware(req, res, next);
}
