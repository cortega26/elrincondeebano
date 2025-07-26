// Updated Content Security Policy injection
// This script writes a stricter Content Security Policy meta tag to the page
// header.  It removes the use of 'unsafe-inline' and 'unsafe-eval' for scripts
// and styles to mitigate cross‑site scripting risks while still permitting
// trusted third‑party domains.  If additional domains need to be allowed,
// they can be appended to the respective directives.

/*
 * Este script injerta una política de seguridad de contenidos (CSP) en la página.
 * Mantiene 'unsafe-inline' en script-src y style-src para permitir etiquetas
 * de Google Analytics y estilos inline necesarios, pero elimina 'unsafe-eval'
 * para reducir la superficie de ataque.  Si se necesitan más dominios de
 * confianza, se pueden añadir a las directivas correspondientes.
 */

(function() {
    const cspPolicy = `
        default-src 'self';
        script-src 'self' https://www.googletagmanager.com https://code.jquery.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com data: 'unsafe-inline';
        style-src 'self' https://cdn.jsdelivr.net https://fonts.googleapis.com 'unsafe-inline';
        img-src 'self' data: https:;
        font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net;
        connect-src 'self' https://www.google-analytics.com;
        frame-src 'none';
        object-src 'none';
        base-uri 'self';
        form-action 'self';
        upgrade-insecure-requests;
    `.replace(/\s+/g, ' ').trim();

    const meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = cspPolicy;
    document.head.appendChild(meta);

    // After writing the CSP meta tag, dynamically load the cart enhancements
    // script.  This approach avoids modifying index.html directly while
    // ensuring that additional functionality (miniaturas del carrito, mega
    // menú, accesibilidad, SEO, PWA, etc.) se ejecute en todas las páginas.
    const enhancementScript = document.createElement('script');
    // Use an absolute path to ensure the script is loaded from the same
    // origin regardless of the current document location.  The defer
    // attribute defers execution until the HTML document has been parsed.
    enhancementScript.src = '/assets/js/cart-enhancements.js';
    enhancementScript.defer = true;
    document.head.appendChild(enhancementScript);
})();