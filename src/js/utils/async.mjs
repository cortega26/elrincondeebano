const isCacheableObject = (value) =>
  (typeof value === 'object' && value !== null) || typeof value === 'function';

const createCacheNode = () => ({
  map: new Map(),
  weakMap: new WeakMap(),
  hasValue: false,
  value: undefined,
});

export const memoize = (fn, cacheSize = 100) => {
  if (typeof fn !== 'function') {
    throw new TypeError('Expected a function to memoize');
  }

  if (!Number.isFinite(cacheSize) || cacheSize < 0) {
    cacheSize = 0;
  }

  const root = createCacheNode();
  const lru = [];

  const touch = (node) => {
    const index = lru.indexOf(node);
    if (index !== -1) {
      lru.splice(index, 1);
    }
    if (cacheSize > 0) {
      lru.push(node);
    }
  };

  const evictIfNeeded = () => {
    if (cacheSize === 0) {
      return;
    }
    while (lru.length > cacheSize) {
      const oldest = lru.shift();
      if (!oldest) {
        continue;
      }
      oldest.hasValue = false;
      oldest.value = undefined;
    }
  };

  const getChildNode = (node, arg) => {
    const useWeakMap = isCacheableObject(arg);
    if (useWeakMap) {
      let next = node.weakMap.get(arg);
      if (!next) {
        next = createCacheNode();
        node.weakMap.set(arg, next);
      }
      return next;
    }
    if (!node.map.has(arg)) {
      node.map.set(arg, createCacheNode());
    }
    return node.map.get(arg);
  };

  return (...args) => {
    if (cacheSize === 0) {
      return fn(...args);
    }
    let node = root;
    for (let i = 0; i < args.length; i += 1) {
      node = getChildNode(node, args[i]);
    }
    if (node.hasValue) {
      touch(node);
      return node.value;
    }
    const result = fn(...args);
    node.value = result;
    node.hasValue = true;
    touch(node);
    evictIfNeeded();
    return result;
  };
};

export const debounce = (func, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
};

export const scheduleIdle = (fn, timeout = 500) => {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(fn, { timeout });
    return { type: 'idle', handle };
  }
  const handle = setTimeout(fn, 0);
  return { type: 'timeout', handle };
};

export const cancelScheduledIdle = (token) => {
  if (!token) return;
  if (
    token.type === 'idle' &&
    typeof window !== 'undefined' &&
    typeof window.cancelIdleCallback === 'function'
  ) {
    window.cancelIdleCallback(token.handle);
  } else if (token.type === 'timeout') {
    clearTimeout(token.handle);
  }
};
