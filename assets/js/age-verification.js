// age-verification.js

function escapeURL(url) {
    return encodeURI(url);
}

function verifyAge(isAdult) {
    if (isAdult) {
        document.body.classList.add('age-verified');
        localStorage.setItem('ageVerified', 'true');
    } else {
        const safeURL = escapeURL('https://cortega26.github.io/Tienda-Ebano/index.html');
        window.location.href = safeURL;
    }
}

function checkAgeVerification() {
    if (localStorage.getItem('ageVerified') === 'true') {
        document.body.classList.add('age-verified');
    } else {
        const overlay = document.getElementById('age-verification-overlay');
        const yesButton = overlay.querySelector('button:first-of-type');
        const noButton = overlay.querySelector('button:last-of-type');

        yesButton.addEventListener('click', () => verifyAge(true));
        noButton.addEventListener('click', () => verifyAge(false));
    }
}

document.addEventListener('DOMContentLoaded', checkAgeVerification);