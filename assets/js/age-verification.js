// Constants
const SAFE_DOMAINS = ['cortega26.github.io'];
const FALLBACK_URL = 'https://cortega26.github.io/Tienda-Ebano/index.html';
const AGE_VERIFIED_KEY = 'ageVerified';

// Helper functions
const isSafeURL = (url) => {
    try {
        const parsedURL = new URL(url);
        return SAFE_DOMAINS.includes(parsedURL.hostname) && 
            ['https:', 'http:'].includes(parsedURL.protocol);
    } catch {
        return false;
    }
};

const safeRedirect = (url) => {
    if (isSafeURL(url)) {
        window.location.href = url;
    } else {
        console.error('Unsafe URL detected');
        window.location.href = FALLBACK_URL;
    }
};

const verifyAge = (isAdult) => {
    if (isAdult) {
        document.body.classList.add('age-verified');
        localStorage.setItem(AGE_VERIFIED_KEY, 'true');
    } else {
        safeRedirect(FALLBACK_URL);
    }
};

const checkAgeVerification = () => {
    if (localStorage.getItem(AGE_VERIFIED_KEY) === 'true') {
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
};

// Run age verification check when the DOM is loaded
document.addEventListener('DOMContentLoaded', checkAgeVerification);