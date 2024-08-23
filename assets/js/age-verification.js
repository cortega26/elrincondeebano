// Constants
const SAFE_DOMAINS = ['cortega26.github.io'];
const FALLBACK_URL = 'https://cortega26.github.io/Tienda-Ebano/index.html';
const AGE_VERIFIED_KEY = 'ageVerified';
const AGE_VERIFICATION_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Helper functions
const isSafeURL = (url) => {
    try {
        const parsedURL = new URL(url);
        return SAFE_DOMAINS.includes(parsedURL.hostname) && 
            ['https:', 'http:'].includes(parsedURL.protocol);
    } catch (error) {
        console.error('Error parsing URL:', error);
        return false;
    }
};

const safeRedirect = (url) => {
    if (isSafeURL(url)) {
        window.location.href = url;
    } else {
        console.error('Unsafe URL detected:', url);
        window.location.href = FALLBACK_URL;
    }
};

const setAgeVerified = () => {
    const expirationDate = new Date(Date.now() + AGE_VERIFICATION_DURATION).toUTCString();
    document.cookie = `${AGE_VERIFIED_KEY}=true; expires=${expirationDate}; path=/; SameSite=Strict; Secure`;
};

const isAgeVerified = () => {
    return document.cookie.split(';').some((item) => item.trim().startsWith(`${AGE_VERIFIED_KEY}=`));
};

const verifyAge = (isAdult) => {
    console.log('verifyAge called with:', isAdult);
    if (isAdult) {
        setAgeVerified();
        document.body.classList.add('age-verified');
        const overlay = document.getElementById('age-verification-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    } else {
        safeRedirect(FALLBACK_URL);
    }
};

const checkAgeVerification = () => {
    console.log('checkAgeVerification called');
    if (isAgeVerified()) {
        console.log('Age already verified');
        document.body.classList.add('age-verified');
    } else {
        console.log('Age not verified, checking for overlay');
        const overlay = document.getElementById('age-verification-overlay');
        if (overlay) {
            console.log('Overlay found, setting up buttons');
            const buttons = overlay.querySelectorAll('button');
            console.log('Buttons found:', buttons.length);
            if (buttons.length === 2) {
                buttons[0].addEventListener('click', () => {
                    console.log('Yes button clicked');
                    verifyAge(true);
                });
                buttons[1].addEventListener('click', () => {
                    console.log('No button clicked');
                    verifyAge(false);
                });
            } else {
                console.error('Age verification buttons not found or incorrect number');
            }
        } else {
            console.error('Age verification overlay not found');
        }
    }
};

// Run age verification check when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM content loaded, running checkAgeVerification');
    checkAgeVerification();
});

// Also run on window load in case DOMContentLoaded was missed
window.addEventListener('load', () => {
    console.log('Window loaded, running checkAgeVerification');
    checkAgeVerification();
});

// Optionally, you can export functions for testing or external use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        isSafeURL,
        safeRedirect,
        verifyAge,
        checkAgeVerification
    };
}