import {
  changedFiles,
  extractBlock,
  extractObjectPairs,
  fail,
  getBaseRef,
  ok,
  readFile,
  readFileFromGit,
} from './_utils.mjs';

const TARGET_FILE = 'service-worker.js';

const files = changedFiles();
if (!files.includes(TARGET_FILE)) {
  ok('service-worker.js unchanged; cache prefix check skipped.');
}

const baseRef = getBaseRef();
let baseContent;
try {
  baseContent = readFileFromGit(baseRef, TARGET_FILE);
} catch (error) {
  fail(`Unable to read ${TARGET_FILE} from ${baseRef}. ${error.message}`);
}

const headContent = readFile(TARGET_FILE);

const baseBlock = extractBlock(baseContent, 'prefixes', 'object');
const headBlock = extractBlock(headContent, 'prefixes', 'object');
if (!baseBlock || !headBlock) {
  fail('CACHE_CONFIG.prefixes block not found in service-worker.js.');
}

const basePairs = extractObjectPairs(baseBlock);
const headPairs = extractObjectPairs(headBlock);
if (!Object.keys(basePairs).length || !Object.keys(headPairs).length) {
  fail('Could not parse cache prefixes from CACHE_CONFIG.prefixes.');
}

const normalize = (pairs) =>
  Object.keys(pairs)
    .sort()
    .map((key) => `${key}:${pairs[key]}`)
    .join('|');

const baseNormalized = normalize(basePairs);
const headNormalized = normalize(headPairs);

if (baseNormalized === headNormalized) {
  fail('service-worker.js changed but cache prefixes were not bumped.');
}

ok('Cache prefixes changed; SW cache bump check passed.');
