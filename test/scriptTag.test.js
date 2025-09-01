import assert from 'node:assert';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

// Ensure index.html loads the correct production script without module type
const html = fs.readFileSync('index.html', 'utf-8');
const dom = new JSDOM(html);

const script = dom.window.document.querySelector('script[src="assets/js/script.min.js"]');
assert.ok(script, 'index.html should reference assets/js/script.min.js');

// The script should not be loaded as a module
assert.ok(!script.type, 'assets/js/script.min.js should not have a type attribute');

console.log('All tests passed');
