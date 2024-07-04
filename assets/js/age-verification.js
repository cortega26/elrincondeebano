// age-verification.js

const SAFE_DOMAINS = ['cortega26.github.io']; // List of allowed domains
const FALLBACK_URL = 'https://cortega26.github.io/Tienda-Ebano/index.html';

function isSafeURL(url) {
    try {
        const parsedURL = new URL(url);
        return SAFE_DOMAINS.includes(parsedURL.hostname) && 
            ['https:', 'http:'].includes(parsedURL.protocol);
    } catch {
        return false;
    }
}

function safeRedirect(url) {
    if (isSafeURL(url)) {
        window.location.href = url;
    } else {
        console.error('Unsafe URL detected');
        window.location.href = FALLBACK_URL;
    }
}

function verifyAge(isAdult) {
    if (isAdult) {
        document.body.classList.add('age-verified');
        localStorage.setItem('ageVerified', 'true');
    } else {
        safeRedirect(FALLBACK_URL);
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