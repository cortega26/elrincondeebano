// SearchBox — inicialización lazy de Pagefind para búsqueda textual estática.
// Pagefind se genera en postbuild:pagefind y se carga dinámicamente desde /pagefind/.

let pagefindLoaded = false;

async function initPagefind() {
  if (pagefindLoaded) return;
  pagefindLoaded = true;

  try {
    // Carga el CSS de pagefind
    const cssLink = document.createElement('link');
    cssLink.rel = 'stylesheet';
    cssLink.href = '/pagefind/pagefind-ui.css';
    document.head.appendChild(cssLink);

    // Carga el JS de pagefind
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/pagefind/pagefind.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });

    // Pagefind se expone como global window.PagefindUI
    const PagefindUI = window.PagefindUI;
    if (!PagefindUI) {
      console.warn('PagefindUI no está disponible como global.');
      return;
    }

    // @ts-expect-error — PagefindUI se expone como global y no tiene tipos
    const _instance = new PagefindUI({
      element: '#search-results',
      showSubResults: false,
      showImages: false,
      excerptLength: 30,
      autofocus: false,
    });

    // Limpia resultados al hacer clic fuera del contenedor de búsqueda
    document.addEventListener('click', (e) => {
      const search = document.getElementById('site-search');
      if (search && e.target instanceof Node && !search.contains(e.target)) {
        const results = document.getElementById('search-results');
        if (results) {
          results.innerHTML = '';
        }
      }
    });
  } catch {
    console.warn('Pagefind no está disponible (¿build sin postbuild:pagefind?)');
  }
}

const input = document.getElementById('search-input');
if (input) {
  input.addEventListener('focus', initPagefind);
  input.addEventListener('mouseenter', initPagefind);
}
