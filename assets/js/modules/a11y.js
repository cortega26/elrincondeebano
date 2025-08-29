// Basic navigation accessibility hooks (migrated from csp.js)
export function setupNavigationAccessibility() {
  try {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') document.body.classList.add('keyboard-navigation');
    });
    document.addEventListener('mousedown', () => {
      document.body.classList.remove('keyboard-navigation');
    });

    const style = document.createElement('style');
    style.textContent = `.keyboard-navigation *:focus { outline: 2px solid var(--primary-color); outline-offset: 2px; }`;
    document.head.appendChild(style);
  } catch (e) {
    console.warn('[modules/a11y] setupNavigationAccessibility error:', e);
  }
}

