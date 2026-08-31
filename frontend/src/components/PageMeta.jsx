import { Helmet } from 'react-helmet-async';
import { DEFAULT_OG_IMAGE, SITE_URL } from '../config';

// Standard share-card dimensions expected by Twitter and Open Graph validators.
const OG_IMAGE_WIDTH = 1200;
const OG_IMAGE_HEIGHT = 630;

export default function PageMeta({
  title = 'Trivela — Stellar Campaign & Rewards',
  description = 'Join Stellar Soroban campaigns, earn rewards, and track on-chain participation with Trivela.',
  path = '/',
  image = DEFAULT_OG_IMAGE,
  imageAlt = 'Trivela — Stellar Campaign & Rewards platform',
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

      {/* Open Graph — validated by https://opengraph.xyz and Facebook Debugger */}
      <meta property="og:site_name" content="Trivela" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:type" content={type} />
      <meta property="og:image" content={imageUrl} />
      <meta property="og:image:secure_url" content={imageUrl} />
      <meta property="og:image:type" content="image/png" />
      <meta property="og:image:width" content={String(OG_IMAGE_WIDTH)} />
      <meta property="og:image:height" content={String(OG_IMAGE_HEIGHT)} />
      <meta property="og:image:alt" content={imageAlt} />

      {/* Twitter / X Card — validated by https://cards-dev.twitter.com/validator */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@TrivelaApp" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />
      <meta name="twitter:image:alt" content={imageAlt} />

      {jsonLd && <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>}
    </Helmet>
  );
}
