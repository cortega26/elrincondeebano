import { expect, test } from '@playwright/test';

import { getProductSku } from '../../astro-poc/src/lib/product-identity.ts';
import productCatalogHelpers from '../helpers/product-catalog.js';

async function expectSharePreviewContract(
  page: Parameters<typeof test>[1]['page'],
  expectedCanonical: string,
  label: string
) {
  const description = page.locator('meta[name="description"]');
  const ogDescription = page.locator('meta[property="og:description"]');
  const twitterDescription = page.locator('meta[name="twitter:description"]');
  const ogTitle = page.locator('meta[property="og:title"]');
  const twitterTitle = page.locator('meta[name="twitter:title"]');
  const canonical = page.locator('link[rel="canonical"]');
  const ogUrl = page.locator('meta[property="og:url"]');
  const ogImage = page.locator('meta[property="og:image"]');

  await expect(canonical, `${label} canonical`).toHaveAttribute('href', expectedCanonical);
  await expect(ogUrl, `${label} og:url`).toHaveAttribute('content', expectedCanonical);

  const descriptionValue = await description.getAttribute('content');
  expect(descriptionValue, `${label} description`).toBeTruthy();
  await expect(ogDescription, `${label} og:description`).toHaveAttribute(
    'content',
    descriptionValue!
  );
  await expect(twitterDescription, `${label} twitter:description`).toHaveAttribute(
    'content',
    descriptionValue!
  );

  const ogTitleValue = await ogTitle.getAttribute('content');
  expect(ogTitleValue, `${label} og:title`).toBeTruthy();
  await expect(twitterTitle, `${label} twitter:title`).toHaveAttribute('content', ogTitleValue!);

  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    'content',
    'summary_large_image'
  );
  await expect(page.locator('meta[property="og:image:type"]')).toHaveAttribute(
    'content',
    /image\/(?:jpeg|png)/
  );
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute('content', '1200');
  await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute('content', '1200');
  await expect(ogImage).toHaveAttribute(
    'content',
    /^https:\/\/www\.elrincondeebano\.com\/.+\.(?:jpe?g|png)\?v=[a-f0-9]{12}$/i
  );
}

const { getSharePreviewSampleProduct } = productCatalogHelpers;
const sampleSku = getProductSku(getSharePreviewSampleProduct());

test('supported public routes keep the browser-visible share-preview contract aligned', async ({
  page,
  request,
}) => {
  const cases = [
    {
      path: '/',
      canonical: 'https://www.elrincondeebano.com/',
      label: 'homepage',
    },
    {
      path: '/bebidas/',
      canonical: 'https://www.elrincondeebano.com/bebidas/',
      label: 'modern category page',
    },
    {
      path: `/p/${sampleSku}/`,
      canonical: `https://www.elrincondeebano.com/p/${sampleSku}/`,
      label: 'product page',
    },
  ];

  for (const testCase of cases) {
    await page.goto(testCase.path, { waitUntil: 'networkidle' });
    if (testCase.path === '/') {
      await page.waitForFunction(() => window.__APP_READY__ === true);
    }
    await expectSharePreviewContract(page, testCase.canonical, testCase.label);

    const ogImageUrl = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(ogImageUrl, `${testCase.label} og:image`).toBeTruthy();
    const imageResponse = await request.get(ogImageUrl!);
    expect(imageResponse.ok(), `${testCase.label} og:image should resolve`).toBeTruthy();
    expect(imageResponse.headers()['content-type']).toMatch(/^image\/(?:jpeg|png)\b/i);
  }
});
