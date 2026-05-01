const DEFAULT_PAGE_SIZE = 24;

export function createCatalogViewController({
  container,
  sortSelect,
  searchInput,
  discountCheckbox,
  loadMoreButton,
  resultsStatus,
  emptyState,
  sentinel,
  normalizeSearchText,
  parseNumber,
  pageSize = DEFAULT_PAGE_SIZE,
  intersectionObserverFactory,
} = {}) {
  let visibleLimit = pageSize;
  let matchedCount = 0;
  let observer = null;
  let paginationSuppressed = false;
  let paginationResumeFrameId = null;
  let paginationResumeTimeoutId = null;
  let paginationSuspensionToken = 0;

  const observerFactory =
    intersectionObserverFactory ||
    (typeof globalThis.IntersectionObserver === 'function'
      ? (callback, options) => new globalThis.IntersectionObserver(callback, options)
      : null);

  function disconnectObserver() {
    observer?.disconnect();
    observer = null;
  }

  function clearScheduledPaginationResume() {
    if (typeof globalThis.cancelAnimationFrame === 'function' && paginationResumeFrameId !== null) {
      globalThis.cancelAnimationFrame(paginationResumeFrameId);
    }
    if (paginationResumeTimeoutId !== null) {
      globalThis.clearTimeout(paginationResumeTimeoutId);
    }
    paginationResumeFrameId = null;
    paginationResumeTimeoutId = null;
  }

  function schedulePaginationResume(callback, framesRemaining) {
    if (typeof globalThis.requestAnimationFrame === 'function') {
      paginationResumeFrameId = globalThis.requestAnimationFrame(() => {
        if (framesRemaining <= 1) {
          paginationResumeFrameId = null;
          callback();
          return;
        }
        schedulePaginationResume(callback, framesRemaining - 1);
      });
      return;
    }

    paginationResumeTimeoutId = globalThis.setTimeout(() => {
      paginationResumeTimeoutId = null;
      callback();
    }, 32);
  }

  function updateView() {
    if (!(container instanceof HTMLElement)) {
      return { matchedCount, visibleLimit };
    }

    const products = Array.from(container.querySelectorAll('.producto'));
    const sortValue = sortSelect?.value || 'original';
    const keyword = normalizeSearchText(searchInput?.value || '');
    const discountOnly = !!discountCheckbox?.checked;

    const sortedProducts = [...products].sort((a, b) => {
      const aOrder = parseNumber(a.dataset.productOrder, 0);
      const bOrder = parseNumber(b.dataset.productOrder, 0);
      const aName = normalizeSearchText(a.dataset.productName || '');
      const bName = normalizeSearchText(b.dataset.productName || '');
      const aPrice = parseNumber(a.dataset.productFinalPrice, 0);
      const bPrice = parseNumber(b.dataset.productFinalPrice, 0);

      switch (sortValue) {
        case 'name-asc':
          return aName.localeCompare(bName, 'es');
        case 'name-desc':
          return bName.localeCompare(aName, 'es');
        case 'price-asc':
          return aPrice - bPrice;
        case 'price-desc':
          return bPrice - aPrice;
        default:
          return aOrder - bOrder;
      }
    });

    sortedProducts.forEach((item) => container.appendChild(item));

    const matchingProducts = [];
    sortedProducts.forEach((item) => {
      const name = normalizeSearchText(item.dataset.productName || '');
      const hasDiscount = parseNumber(item.dataset.productDiscount, 0) > 0;
      const keywordMatch = !keyword || name.includes(keyword);
      const discountMatch = !discountOnly || hasDiscount;
      if (keywordMatch && discountMatch) {
        matchingProducts.push(item);
      }
    });

    matchedCount = matchingProducts.length;
    const matchingSet = new Set(matchingProducts);

    matchingProducts.forEach((item, index) => {
      item.classList.toggle('is-hidden', index >= visibleLimit);
    });

    sortedProducts.forEach((item) => {
      if (!matchingSet.has(item)) {
        item.classList.add('is-hidden');
      }
    });

    container.setAttribute('data-total-products', String(matchedCount));

    if (resultsStatus instanceof HTMLElement) {
      resultsStatus.textContent = `${matchedCount} productos encontrados`;
    }

    if (emptyState instanceof HTMLElement) {
      emptyState.classList.toggle('d-none', matchedCount > 0);
    }

    if (loadMoreButton instanceof HTMLElement) {
      const hasMore = matchedCount > visibleLimit;
      const remaining = Math.max(matchedCount - visibleLimit, 0);
      loadMoreButton.classList.toggle('d-none', !hasMore);
      loadMoreButton.textContent = hasMore
        ? `Cargar más productos (${remaining} restantes)`
        : 'Cargar más productos';
    }

    return { matchedCount, visibleLimit };
  }

  function resetVisibleLimit() {
    visibleLimit = pageSize;
  }

  function loadMore() {
    if (visibleLimit >= matchedCount) {
      return false;
    }

    visibleLimit = Math.min(visibleLimit + pageSize, matchedCount);
    updateView();
    return true;
  }

  function setupPagination() {
    if (!(sentinel instanceof HTMLElement) || typeof observerFactory !== 'function') {
      return null;
    }

    disconnectObserver();
    observer = observerFactory(
      (entries) => {
        if (paginationSuppressed) {
          return;
        }
        const inView = entries.some((entry) => entry.isIntersecting);
        if (inView) {
          loadMore();
        }
      },
      { rootMargin: '-64px 0px 240px 0px' }
    );
    observer.observe(sentinel);
    return observer;
  }

  function suspendPaginationForProgrammaticScroll({ resumeAfterFrames = 2 } = {}) {
    paginationSuppressed = true;
    paginationSuspensionToken += 1;
    const suspensionToken = paginationSuspensionToken;

    clearScheduledPaginationResume();
    disconnectObserver();

    schedulePaginationResume(
      () => {
        if (suspensionToken !== paginationSuspensionToken) {
          return;
        }
        paginationSuppressed = false;
        setupPagination();
      },
      Math.max(1, resumeAfterFrames)
    );
  }

  function disconnect() {
    paginationSuppressed = false;
    paginationSuspensionToken += 1;
    clearScheduledPaginationResume();
    disconnectObserver();
  }

  return {
    updateView,
    resetVisibleLimit,
    loadMore,
    setupPagination,
    suspendPaginationForProgrammaticScroll,
    disconnect,
    getState() {
      return { matchedCount, visibleLimit, paginationSuppressed };
    },
  };
}
