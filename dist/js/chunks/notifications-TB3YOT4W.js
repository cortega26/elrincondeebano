import{a as s}from"./chunk-UEKKBUIS.js";function n(t,o,e,a){let i=document.createElement("div");return i.className="notification-toast",i.setAttribute("role","alert"),i.setAttribute("aria-live","polite"),i.innerHTML=`
        <div class="notification-content">
            <p>${t}</p>
            <div class="notification-actions">
                <button class="primary-action">${o}</button>
                <button class="secondary-action">${e}</button>
            </div>
        </div>
    `,i.querySelector(".primary-action").addEventListener("click",()=>{try{a()}catch(r){console.error("Primary action failed:",r)}i.remove()}),i.querySelector(".secondary-action").addEventListener("click",()=>{i.remove()}),i}function c(t){let o=document.querySelector(".notification-toast");o&&o.remove(),document.body.appendChild(t),setTimeout(()=>{document.body.contains(t)&&t.remove()},300*1e3)}function l(t,o="Una versi\xF3n est\xE1 disponible"){let e=n(o,"Actualizar ahora","Despu\xE9s",()=>{t?t.postMessage({type:"SKIP_WAITING"}):window.location.reload()});c(e)}function u(t){let o=n(t,"Reload","Dismiss",()=>window.location.reload());c(o)}function f(t){let o=n(t,"Retry","Dismiss",()=>window.location.reload());c(o)}var d=s(()=>{});d();export{n as createNotificationElement,f as showConnectivityNotification,c as showNotification,u as showServiceWorkerError,l as showUpdateNotification};
