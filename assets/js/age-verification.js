// age-verification.js

const SAFE_DOMAINS = ['cortega26.github.io']; // List of allowed domains

function isSafeURL(url) {
    try {
        const parsedURL = new URL(url);
        return SAFE_DOMAINS.includes(parsedURL.hostname) && 
          ['https:', 'http:'].includes(parsedURL.protocol);
    } catch {
        return false;
    }
}

function escapeURL(url) {
    return encodeURIComponent(url).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function safeRedirect(url) {
    if (isSafeURL(url)) {
        // Use template literals for string interpolation and escape the URL
        window.location.href = `${escapeURL(url)}`;
    } else {
        console.error('Unsafe URL detected');
        // Redirect to a known safe page
        window.location.href = escapeURL('https://cortega26.github.io/Tienda-Ebano/index.html');
    }
}

function verifyAge(isAdult) {
    if (isAdult) {
        document.body.classList.add('age-verified');
        localStorage.setItem('ageVerified', 'true');
    } else {
        safeRedirect('https://cortega26.github.io/Tienda-Ebano/index.html');
    }
}

function checkAgeVerification() {
    if (localStorage.getItem('ageVerified') === 'true') {
        document.body.classList.add('age-verified');
    } else {
        const overlay = document.getElementById('age-verification-overlay');
        if (overlay) {
            const yesButton = overlay.querySelector('button:first-of-type');
            const noButton = overlay.querySelector('button:last-of-type');

            if (yesButton && noButton) {
                yesButton.addEventListener('click', () => verifyAge(true));
                noButton.addEventListener('click', () => verifyAge(false));
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', checkAgeVerification);