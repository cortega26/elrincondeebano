import"./chunk-72ZECFVW.js";function e(t,o,n,r){let i=document.createElement("div");return i.className="notification-toast",i.setAttribute("role","alert"),i.setAttribute("aria-live","polite"),i.innerHTML=`
        <div class="notification-content">
            <p>${t}</p>
            <div class="notification-actions">
                <button class="primary-action">${o}</button>
                <button class="secondary-action">${n}</button>
            </div>
        </div>
    `,i.querySelector(".primary-action").addEventListener("click",()=>{try{r()}catch(s){console.error("Primary action failed:",s)}i.remove()}),i.querySelector(".secondary-action").addEventListener("click",()=>{i.remove()}),i}function c(t){let o=document.querySelector(".notification-toast");o&&o.remove(),document.body.appendChild(t),setTimeout(()=>{document.body.contains(t)&&t.remove()},300*1e3)}function a(){try{if(typeof window=="undefined")return;let t=window.navigator&&window.navigator.userAgent||"";if(/jsdom/i.test(t))return;let o=window.location&&window.location.reload;typeof o=="function"&&o.call(window.location)}catch(t){}}function d(t,o="Una versi\xF3n est\xE1 disponible"){let n=e(o,"Actualizar ahora","Despu\xE9s",()=>{t?t.postMessage({type:"SKIP_WAITING"}):a()});c(n)}function f(t){let o=e(t,"Reload","Dismiss",()=>a());c(o)}function l(t){let o=e(t,"Retry","Dismiss",()=>a());c(o)}export{e as createNotificationElement,l as showConnectivityNotification,c as showNotification,f as showServiceWorkerError,d as showUpdateNotification};
