(function() {
    const cspPolicy = `
        default-src 'self';
        script-src 'self' https://www.googletagmanager.com https://code.jquery.com https://cdn.jsdelivr.net https://cdnjs.cloudflare.com data: 'unsafe-inline' 'unsafe-eval';
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
    meta.httpEquiv = "Content-Security-Policy";
    meta.content = cspPolicy;
    document.head.appendChild(meta);
})();