// age-verification.js
function verifyAge(isAdult) {
    if (isAdult) {
        document.body.classList.add('age-verified');
        localStorage.setItem('ageVerified', 'true');
    } else {
        window.location.href = 'https://cortega26.github.io/Tienda-Ebano/index.html';
    }
}

// Verificar si ya se ha confirmado la edad
function checkAgeVerification() {
    if (localStorage.getItem('ageVerified') === 'true') {
        document.body.classList.add('age-verified');
    }
}

// Ejecutar la verificación al cargar la página
document.addEventListener('DOMContentLoaded', checkAgeVerification);