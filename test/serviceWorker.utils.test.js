import assert from 'node:assert';
import { addTimestamp, isCacheFresh } from '../service-worker.js';

const resp = new Response('data');
const stamped = await addTimestamp(resp.clone(), 'static');
assert.ok(stamped.headers.get('sw-timestamp'), 'timestamp should be added');
assert.strictEqual(stamped.headers.get('cache-type'), 'static');
assert.strictEqual(isCacheFresh(stamped, 'static'), true, 'fresh response should be fresh');

const headers = new Headers(stamped.headers);
const past = Date.now() - 2 * 24 * 60 * 60 * 1000; // older than cache duration
headers.set('sw-timestamp', past.toString());
const oldResp = new Response('old', { headers });
assert.strictEqual(isCacheFresh(oldResp, 'static'), false, 'stale response should be stale');

console.log('All tests passed');
