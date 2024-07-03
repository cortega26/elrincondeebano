// age-verification.js

// Función para escapar URLs
function escapeURL(url) {
    return encodeURI(url);
}

// Exportamos la función verifyAge para que pueda ser utilizada desde el HTML
window.verifyAge = function(isAdult) {
    if (isAdult) {
        document.body.classList.add('age-verified');
        localStorage.setItem('ageVerified', 'true');
    } else {
        const safeURL = escapeURL('https://cortega26.github.io/Tienda-Ebano/index.html');
        window.location.href = safeURL;
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
