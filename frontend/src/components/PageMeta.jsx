import { Helmet } from 'react-helmet-async';
import { DEFAULT_OG_IMAGE, SITE_URL } from '../config';

export default function PageMeta({
  title = 'Trivela — Stellar Campaign & Rewards',
  description = 'Join Stellar Soroban campaigns, earn rewards, and track on-chain participation with Trivela.',
  path = '/',
  image = DEFAULT_OG_IMAGE,
  type = 'website',
  jsonLd = null,
}) {
  const canonicalUrl = `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const imageUrl = image.startsWith('http') ? image : `${SITE_URL}${image}`;

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonicalUrl} />
      <meta property="og:site_name" content="Trivela" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={imageUrl} />
      <meta property="og:type" content={type} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />
      {jsonLd && <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>}
    </Helmet>
  );
}
