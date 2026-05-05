'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { withMockedFetch } = require('./helpers/network-harness.js');
const {
  SITE_ORIGIN,
  makeHtmlResponse,
  makeImageResponse,
  makeSharePreviewHtml,
} = require('./helpers/share-preview-fixtures.js');

async function loadModule() {
  return import('../tools/share-preview-diagnose.mjs');
}

test('runSharePreviewDiagnosis flags social bot challenges independently from browser success', async () => {
  const { runSharePreviewDiagnosis } = await loadModule();

  await withMockedFetch(
    async (url, options = {}) => {
      const target = String(url);
      const userAgent = options?.headers?.['user-agent'] || '';

      if (target === `${SITE_ORIGIN}/`) {
        if (userAgent.includes('WhatsApp')) {
          return makeHtmlResponse(
            '<html><body>Just a moment... /cdn-cgi/challenge-platform/</body></html>',
            {
              'cf-cache-status': 'DYNAMIC',
              'cf-ray': 'wa-ray',
            }
          );
        }

        return makeHtmlResponse(
          makeSharePreviewHtml({
            title: 'El Rincón de Ébano',
            canonical: `${SITE_ORIGIN}/`,
            ogImage: `${SITE_ORIGIN}/assets/images/og/home.og.jpg?v=1234567890ab`,
          }),
          {
            'cf-cache-status': 'HIT',
            'cf-ray': 'browser-ray',
          }
        );
      }

      if (target === `${SITE_ORIGIN}/assets/images/og/home.og.jpg?v=1234567890ab`) {
        return makeImageResponse('image/jpeg');
      }

      return new Response('not found', { status: 404 });
    },
    async () => {
      const report = await runSharePreviewDiagnosis({
        baseUrl: SITE_ORIGIN,
        route: '/',
        attempts: 1,
        profiles: ['browser', 'whatsapp'],
        reportPath: 'reports/share-preview/test-diagnostics.json',
      });

      assert.equal(report.success, false);
      assert.deepEqual(report.profiles, ['browser', 'whatsapp']);
      assert.equal(report.results[0].summary.successCount, 1);
      assert.equal(report.results[1].summary.challengeCount, 1);
      assert.equal(report.results[1].attempts[0].failurePhase, 'html');
      assert.equal(report.results[1].attempts[0].html.challengeDetected, true);
      assert.match(
        report.results[1].attempts[0].html.challengeEvidence || '',
        /cdn-cgi\/challenge-platform/i
      );
      assert.deepEqual(report.suspicions, [
        {
          code: 'social-bot-challenge',
          message:
            'At least one social-bot profile received a challenge/interstitial while the browser profile did not.',
        },
      ]);
    }
  );
});

test('runSharePreviewDiagnosis flags edge challenge injection when every profile is challenged', async () => {
  const { runSharePreviewDiagnosis } = await loadModule();

  await withMockedFetch(
    async (url) => {
      const target = String(url);
      if (target === `${SITE_ORIGIN}/`) {
        return makeHtmlResponse(
          '<html><body><script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script></body></html>',
          {
            'cf-cache-status': 'DYNAMIC',
            'cf-ray': 'edge-ray',
          }
        );
      }

      return new Response('not found', { status: 404 });
    },
    async () => {
      const report = await runSharePreviewDiagnosis({
        baseUrl: SITE_ORIGIN,
        route: '/',
        attempts: 2,
        profiles: ['browser', 'whatsapp'],
        reportPath: 'reports/share-preview/test-diagnostics-edge.json',
      });

      assert.equal(report.success, false);
      assert.deepEqual(report.suspicions, [
        {
          code: 'edge-challenge-injection',
          message:
            'Every tested profile received HTML contaminated by a challenge/interstitial script, which points to edge-side injection rather than route-specific metadata drift.',
        },
      ]);
      assert.equal(report.results[0].summary.challengeCount, 2);
      assert.equal(report.results[1].summary.challengeCount, 2);
    }
  );
});
