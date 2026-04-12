'use strict';

const SITE_ORIGIN = 'https://www.elrincondeebano.com';
const DEFAULT_SITEMAP_URLS = Object.freeze([
  `${SITE_ORIGIN}/`,
  `${SITE_ORIGIN}/bebidas/`,
  `${SITE_ORIGIN}/p/pid-123/`,
]);

function makeSitemapXml(urls = DEFAULT_SITEMAP_URLS) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset>
${urls.map((url) => `  <url><loc>${url}</loc></url>`).join('\n')}
</urlset>`;
}

function makeSharePreviewHtml({
  title = 'Page',
  canonical = `${SITE_ORIGIN}/page/`,
  description = 'Share preview description',
  ogImage = `${SITE_ORIGIN}/assets/images/og/home.og.jpg?v=1234567890ab`,
  withWhatsapp = false,
} = {}) {
  return `<!doctype html>
<html>
  <head>
    <title>${title}</title>
    <meta name="description" content="${description}">
    <link rel="canonical" href="${canonical}">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:image" content="${ogImage}">
    <meta property="og:image:type" content="image/jpeg">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="1200">
    <meta property="og:url" content="${canonical}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">
    <meta name="twitter:image" content="${ogImage}">
  </head>
  <body>
    ${withWhatsapp ? '<a href="https://wa.me/123456789">WhatsApp</a>' : ''}
  </body>
</html>`;
}

function makeHtmlResponse(html, headers = {}) {
  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      ...headers,
    },
  });
}

function makeXmlResponse(xml) {
  return new Response(xml, {
    status: 200,
    headers: { 'content-type': 'application/xml' },
  });
}

function makeImageResponse(contentType = 'image/jpeg', body = 'img') {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': contentType },
  });
}

function makeJsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

async function buildCompliantHtmlHeaders() {
  const { buildSecurityHeadersPolicy } = await import('../../tools/security-header-policy.mjs');
  return {
    'content-type': 'text/html; charset=utf-8',
    ...buildSecurityHeadersPolicy(),
  };
}

module.exports = {
  DEFAULT_SITEMAP_URLS,
  SITE_ORIGIN,
  buildCompliantHtmlHeaders,
  makeHtmlResponse,
  makeImageResponse,
  makeJsonResponse,
  makeSharePreviewHtml,
  makeSitemapXml,
  makeXmlResponse,
};
