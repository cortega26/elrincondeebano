'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

const picomatch = require('picomatch');
const normalizePath = require('normalize-path');

const BANG = '!';
const DEFAULT_OPTIONS = { returnIndex: false };
const arrify = (item) => (Array.isArray(item) ? item : [item]);

const createPattern = (matcher, options) => {
  if (typeof matcher === 'function') {
    return matcher;
  }

  if (typeof matcher === 'string') {
    const glob = picomatch(matcher, options);
    return (string) => matcher === string || glob(string);
  }

  if (matcher instanceof RegExp) {
    return (string) => matcher.test(string);
  }

  return () => false;
};

const matchPatterns = (patterns, negPatterns, args, returnIndex) => {
  const isList = Array.isArray(args);
  const pathLike = isList ? args[0] : args;

  if (!isList && typeof pathLike !== 'string') {
    throw new TypeError(
      `anymatch: second argument must be a string: got ${Object.prototype.toString.call(pathLike)}`
    );
  }

  const path = normalizePath(pathLike, false);

  for (let index = 0; index < negPatterns.length; index += 1) {
    if (negPatterns[index](path)) {
      return returnIndex ? -1 : false;
    }
  }

  const applied = isList ? [path].concat(args.slice(1)) : null;
  for (let index = 0; index < patterns.length; index += 1) {
    const pattern = patterns[index];
    if (isList ? pattern(...applied) : pattern(path)) {
      return returnIndex ? index : true;
    }
  }

  return returnIndex ? -1 : false;
};

const anymatch = (matchers, testString, options = DEFAULT_OPTIONS) => {
  if (matchers == null) {
    throw new TypeError('anymatch: specify first argument');
  }

  const opts = typeof options === 'boolean' ? { returnIndex: options } : options;
  const returnIndex = opts.returnIndex || false;
  const matchersList = arrify(matchers);
  const negatedGlobs = matchersList
    .filter((item) => typeof item === 'string' && item.charAt(0) === BANG)
    .map((item) => item.slice(1))
    .map((item) => picomatch(item, opts));
  const patterns = matchersList
    .filter((item) => typeof item !== 'string' || item.charAt(0) !== BANG)
    .map((matcher) => createPattern(matcher, opts));

  if (testString == null) {
    return (nextTestString, nextReturnIndex = false) =>
      matchPatterns(patterns, negatedGlobs, nextTestString, nextReturnIndex);
  }

  return matchPatterns(patterns, negatedGlobs, testString, returnIndex);
};

anymatch.default = anymatch;
module.exports = anymatch;
