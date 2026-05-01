function getScrollTop(scrollRoot) {
  const candidates = [
    scrollRoot?.scrollY,
    scrollRoot?.pageYOffset,
    scrollRoot?.document?.documentElement?.scrollTop,
  ];

  const value = candidates.find((candidate) => Number.isFinite(candidate));
  return Number.isFinite(value) ? value : 0;
}

function getHashTarget(documentRef, href) {
  if (typeof href !== 'string' || !href.startsWith('#')) {
    return null;
  }

  const targetId = decodeURIComponent(href.slice(1));
  if (!targetId || typeof documentRef?.getElementById !== 'function') {
    return null;
  }

  return documentRef.getElementById(targetId);
}

export function scrollToHashTarget({
  href = '',
  documentRef = globalThis.document,
  scrollRoot = globalThis,
  onBeforeScroll = () => {},
  onAfterScroll = () => {},
} = {}) {
  const scrollTarget = getHashTarget(documentRef, href);
  if (!scrollTarget || typeof scrollTarget.getBoundingClientRect !== 'function') {
    return false;
  }

  const documentElement = documentRef.documentElement;
  const body = documentRef.body;
  const previousDocumentScrollBehavior = documentElement?.style.scrollBehavior || '';
  const previousBodyScrollBehavior = body?.style.scrollBehavior || '';

  try {
    onBeforeScroll(scrollTarget);

    // Force an instant jump using the standard scroll API instead of relying on
    // browser-specific `behavior: "instant"` support.
    if (documentElement) {
      documentElement.style.scrollBehavior = 'auto';
    }
    if (body) {
      body.style.scrollBehavior = 'auto';
    }

    const targetTop = scrollTarget.getBoundingClientRect().top + getScrollTop(scrollRoot);
    const scrollPaddingTop =
      parseFloat(scrollRoot?.getComputedStyle?.(documentElement)?.scrollPaddingTop || '0') || 0;
    const nextTop = Math.max(0, targetTop - scrollPaddingTop);

    if (typeof scrollRoot?.scrollTo === 'function') {
      scrollRoot.scrollTo(0, nextTop);
    } else if (typeof scrollTarget.scrollIntoView === 'function') {
      scrollTarget.scrollIntoView();
    }

    if (
      typeof scrollRoot?.history?.pushState === 'function' &&
      scrollRoot?.location?.hash !== href
    ) {
      scrollRoot.history.pushState(scrollRoot.history.state, '', href);
    }

    onAfterScroll(scrollTarget);
    return true;
  } finally {
    if (documentElement) {
      documentElement.style.scrollBehavior = previousDocumentScrollBehavior;
    }
    if (body) {
      body.style.scrollBehavior = previousBodyScrollBehavior;
    }
  }
}
