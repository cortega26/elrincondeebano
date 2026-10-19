# Admin móvil — registro de diseño (spike, plan 251)

> Spike del plan 251 (audit-12). **No es un rollout**: decide si el camino
> móvil del admin es una PWA sobre el modo remoto autenticado y qué parte
> es código de repo vs. operación. La verdad de uso sigue en
> [`docs/operations/COMMS.md`](../../../docs/operations/COMMS.md) (plan 232)
> y [ADR 0011](../../../docs/adr/0011-private-whatsapp-comms-module.md);
> este archivo es interno del admin y solo los complementa.
>
> **Estado del prototipo: NO enviado.** El build del admin desactiva el
> directorio de estáticos (`publicDir: false`, `vite.config.ts:11`), que es
> la condición de STOP del plan 251 («no hay directorio de estáticos en el
> vite config; la colocación del manifest es una decisión de build del
> dueño»). Abajo quedan las opciones verificadas para esa decisión.
>
> **La operación (túnel, Cloudflare Access, deploy key) está fuera del
> alcance de este repo.** Nada de este registro configura ni verifica esos
> componentes.

## Contexto

El spec de comms (plan 217) aparcó «Acceso móvil / PWA» porque requería
acceso autenticado fuera de loopback. Esa premisa cambió: el modo remoto
autenticado existe desde el 2026-10-13 (`ADMIN_REMOTE_ORIGIN` detrás de
Cloudflare Access, credencial en cada petición; `README.md:33-49`). El
WhatsApp del operador vive en el teléfono: preparar una promoción o
responder a un vecino hoy obliga a pasar por el escritorio. La UI de comms
ya sobrevive a 390 px (e2e «vista móvil» en
`test/e2e/comms.spec.ts`); el hueco real es **acceso +
instalabilidad + docs**, no maquetación.

## Modelo de acceso

- **Despliegue**: `ADMIN_REMOTE_ORIGIN=https://admin.elrincondeebano.com`
  **solo** en la instancia OCI, `HOST=127.0.0.1`. Cloudflare Access con
  política _deny-by-default_ es requisito previo (verificado fuera del
  repo); el túnel no autentica por sí solo. El hostname entra en la
  allowlist de `Host`; las mutaciones validan el `Origin` HTTPS.
- **Credencial**: en modo remoto **toda** petición a `/api/v1/*` exige
  `x-admin-credential` (incluida `health`; el túnel conecta desde
  loopback y eso no cuenta como autenticación). En el teléfono, la
  primera carga muestra el modal de credencial
  (`CredentialPrompt.tsx:21-23`); al guardarla se aplica el alcance del
  plan 223: loopback → `localStorage`, cualquier otro origen →
  `sessionStorage` (`credentialStore.ts:29-39`). Un 401 la borra y el
  modal vuelve (`requestCore.ts:59`). Consecuencia: **en el teléfono la
  credencial se pide una vez por sesión de navegador**; si el sistema
  descarga la app o se cierra la pestaña, se vuelve a pedir.
- **Publicación**: el botón Publicar empuja a GitHub y requiere una deploy
  key dedicada en la VM (`README.md:47-49`). Si esa key no está o el
  push falla desde la VM, en el teléfono no hay que fingir un release.
- **Qué ve el operador en el teléfono**: login de Access (si la sesión
  expiró) → prompt de credencial → app normal. Nada del flujo cambia por
  estar en el teléfono salvo lo listado en cada flujo.

## Los tres flujos del teléfono

### 1. Promoción con foto al grupo

Pasos (plantilla «Promoción de producto», pestaña «Mensaje nuevo»):

1. Abrir la app; resolver Access + credencial si toca.
2. Pestaña «Mensaje nuevo» → elegir la plantilla de promoción.
3. Buscar el producto del catálogo (`ProductPicker`); precio, oferta,
   enlace y foto salen del catálogo real.
4. Marcar «Revisé que hay stock real» (obligatorio para difusión,
   `useCommsWorkspace.ts:344-351`).
5. Destino: el grupo (el admin no conoce el grupo; se elige dentro de
   WhatsApp).
6. Imágenes: por defecto todas las del producto/plantilla; se puede
   adjuntar una propia (cámara o galería del teléfono; el input acepta
   JPEG/PNG/WebP).
7. Pulsar **«Compartir texto + imagen»** si el navegador admite compartir
   archivos (Web Share; el botón solo aparece con capacidad real,
   `ShareButton.tsx:14-24`). Se comparten JPEG convertidos en el cliente
   (`handoff.ts:26-54`). Elegir WhatsApp → grupo → Enviar.
8. Volver al admin y pulsar «Sí, marcar como enviado»; solo así queda
   `enviado_manual` en el historial (`useCommsWorkspace.ts:476-487`).

Modos de fallo:

- **Sin Web Share con archivos** (capacidades por navegador), el flujo de
  escritorio «Copiar imagen → pegar (Ctrl+V)» **no existe en el
  teléfono**: quedan «Descargar» + «Copiar mensaje» y adjuntar a mano.
  (En el teléfono el botón de compartir aparece o no según capacidad; los
  navegadores objetivo iOS Safari/Chrome Android modernos soportan
  Web Share con archivos, verificar en el dispositivo real.)
- **La confirmación final es frágil en móvil**: `pendingConfirm` vive solo
  en memoria; si el sistema descarga la pestaña al volver de WhatsApp, se
  pierde el botón y la actividad queda en `compartir_iniciado` /
  `chat_abierto` (honesto, pero incompleto). Verificar en dispositivo.
- Un JPEG de la cámara del teléfono puede ser grande; la conversión
  reescala a 1600 px (`handoff.ts:8,32-33`). El borrador del mensaje se
  persiste en `localStorage` sin número pegado ni `{nombre}`
  (`useCommsWorkspace.ts:86-104`).
- Repetición: mismo texto al mismo destino en 7 días → bloqueo con
  confirmación explícita (`repeatAck`).

### 2. Responder a un vecino (número pegado)

Pasos:

1. Pestaña «Responder a vecino»; buscar parte del tema (`/` enfoca el
   buscador) y Enter para elegir la primera coincidencia.
2. Destino → «Pegar un número…» → escribir el número (`type=tel`);
   se normaliza y se valida (`aria-invalid` si no normaliza).
3. «Abrir chat con mensaje» → `wa.me` con el texto listo
   (`buildWhatsAppUrl`); elegir Enviar dentro de WhatsApp.
4. Volver → «Sí, marcar como enviado».

Modos de fallo:

- **El número pegado no se guarda** (privacidad por diseño): la actividad
  lo registra como «Número pegado» y el borrador no lo persiste; si la
  página se recarga, hay que volver a pegarlo.
- `{nombre}` no se puede rellenar solo para un número desconocido
  (sin contacto guardado) → escribir el nombre a mano o ajustar el texto.
- `window.open` bloqueado → la UI muestra el enlace «Abrir WhatsApp» de
  respaldo (`useCommsWorkspace.ts:396-408`). En iOS la apertura de la app
  WhatsApp desde una pestaña puede comportarse distinto en standalone
  (verificar en dispositivo).
- Misma fragilidad de confirmación final que el flujo 1.

### 3. Toggle de stock tras una entrega

Pasos:

1. Ir a Productos y seleccionar el producto.
2. «Editar» en el inspector → formulario (`ProductsPage.tsx:794`,
   `ProductForm`).
3. Marcar/desmarcar «Stock disponible» (`ProductForm.tsx:267`) y pulsar
   «Guardar cambios» (`ProductForm.tsx:467-469`).
4. Opcional: Publicar para que el storefront lo vea.

Modos de fallo:

- Mutación requiere modo `operator` + credencial (401 → modal; 409 →
  «los datos cambiaron en otra pestaña», repetir).
- **La página de Productos no está validada a ancho móvil**: el único
  test a 390 px es el de comms; el formulario en el teléfono puede
  requerir scroll horizontal. No afirmado ni negado por este spike.
- Publicar depende de la deploy key de la VM (fuera del repo).

## Instalabilidad (manifest)

**Prototipo: no enviado** — STOP del plan (ver recuadro arriba). Para que
la colocación no sea un stub, este spike verificó las opciones en una
**copia scratch** de la app (misma versión de Vite 8.3.3; el repo no se
tocó):

- **A. Habilitar `publicDir`** (`public/manifest.webmanifest`): cambio de
  1 línea de config; produciría `dist/web/manifest.webmanifest` tal como
  espera el plan. No probado (es la decisión del dueño).
- **B. Archivo junto a `index.html`** (`src/web/manifest.webmanifest` +
  `<link rel="manifest" href="./manifest.webmanifest">`): **ningún cambio
  de config**. Verificado en scratch: dev sirve 200
  `application/manifest+json`; build exit 0, emite
  `dist/web/assets/manifest-<hash>.webmanifest` con el href reescrito a
  `/assets/manifest-<hash>.webmanifest` (no queda en la raíz de
  `dist/web`).
- **C. Plugin de Vite / emisión propia**: cambio de config; más
  ceremonia; solo si A y B se rechazan.

Hallazgos de la verificación que afectan al plan de build:

- **MIME en producción**: el mapa `mimeTypes` del servidor Fastify
  (`app.ts:306-319`) no incluye `.webmanifest` → hoy se serviría como
  `application/octet-stream` (en `/assets/`, además, con caché
  `immutable`). Añadir `.webmanifest → application/manifest+json` es
  parte del build plan, con cualquiera de las opciones.
- **Íconos con B**: las rutas del manifest se resuelven respecto a la URL
  del manifest (`/assets/…`), así que los `src` deben ser absolutos
  (`/assets/images/web/icon-192.png`). En el despliegue funcionan por el
  fallback al repo-root de `app.ts:349`; en `vite dev:web` los
  `/assets/images/...` caen hoy en el fallback SPA (verificado: 200
  `text/html`), así que los íconos solo se ven en el despliegue.
- **Íconos**: existen `assets/images/web/icon-192.png` y `icon-512.png`
  (storefront). Reutilizarlos es el camino mínimo; que sean «suficientes»
  como ícono del admin es decisión del dueño (pregunta abierta 4).
- **Display mode**: `standalone` (no `fullscreen`); `start_url` y `scope`
  en `/`. `theme_color`/`background_color` candidatos: `#2e7d32` /
  `#f8f9fa` (`global.css`). Nota: hay tema oscuro de preferencias
  (`preferences.ts`), así que un `theme_color` fijo es un compromiso —
  se puede refinar con `media` en el manifest.
- **Service worker: decidir EN CONTRA** (sin evidencia que lo justifique):
  caché offline del admin = superficie de escritura con estado viejo;
  un footgun para catálogo/comms. Si algún día se pide, que sea un build
  plan propio con reglas de invalidación.
- Safe-area (`viewport-fit=cover` + `env(safe-area-inset-*)`) es una
  pasada trivial opcional para el build plan; no se envió aquí.

## Estado de validación

- Verificado por comandos: `npm run admin:build` y `npm run admin:test`
  en verde en este worktree (114 archivos / 873 tests). El prototipo no
  existe en el repo, así que no hay cambio de comportamiento que medir.
- Verificado por código/verificación scratch: acceso y credencial (arriba),
  opciones A/B/C (arriba).
- **NO validado en dispositivo**: no hubo teléfono en este spike. El test
  «vista móvil» (390×844, `scrollWidth ≤ 390`) usa un navegador de
  escritorio de Playwright y **no sustituye** una prueba en teléfono.

## Checklist de smoke manual (en dispositivo) — NO EJECUTADO

Ejecutar contra el despliegue remoto cuando el dueño tenga el teléfono:

1. Abrir `https://admin.elrincondeebano.com` → login Access (si toca) →
   modal de credencial; anotar cuántas veces se pide por sesión y si
   sobrevive a cerrar/reabrir la pestaña.
2. Flujo 2 (el más corto): responder con un número pegado; volver y
   confirmar «marcar como enviado».
3. Flujo 1: promoción al grupo con foto; comprobar si aparece «Compartir
   texto + imagen»; si no, medir el costo del fallback manual.
4. Flujo 3: toggle de stock + Guardar; observar layout a 390 px.
5. Publicar (si se elige probar): confirmar push de la VM o el error.
6. «Añadir a pantalla de inicio» → abrir en standalone → repetir 2-4;
   anotar prompt de credencial, safe-area y si `window.open` a WhatsApp
   vuelve bien al admin.

## Preguntas abiertas (con dueño)

1. ¿Cloudflare Access sostiene el flujo del teléfono (login interactivo,
   cookies de sesión en una PWA standalone de iOS)? — **Dueño: operador**
   (ops, fuera del repo).
2. ¿La publicación (push con la deploy key de la VM) funciona desde el
   teléfono, o Publicar queda como paso de escritorio? — **Dueño:
   operador** (ops/VM).
3. ¿Es aceptable la credencial por sesión (`sessionStorage`, plan 223) en
   el teléfono, o se reabre la UX de credencial? — **Dueño: operador**.
4. ¿Íconos del manifest: reutilizar los del storefront o hacer propios
   del admin? — **Dueño: operador** (decisión de marca; barato de
   cambiar después).
5. ¿El manifest también en loopback (127.0.0.1:3000)? Es inofensivo,
   pero hoy el bypass de credencial haría el prompt irrelevante; decide
   el build plan. — **Dueño: plan de build**.
6. ¿Web Share con archivos está disponible en el teléfono real del
   operador? Determina el modo principal del flujo 1. — **Dueño:
   operador** (probar en dispositivo).
7. ¿Se añade `.webmanifest` al mapa MIME del servidor? (necesario para
   servirlo con su tipo correcto) — **Dueño: plan de build**.

## Veredicto y plan de build

**Veredicto**: el camino móvil es viable como PWA _manifest-only_ del
admin sobre el modo remoto autenticado. El trabajo de repo es **S**: no
hay que tocar backend salvo una línea de MIME, y la UI de comms ya es
móvil-utilizable. El costo real es doble y está fuera del código: la
superficie expuesta (mitigada por Access + credencial por petición) y la
**operación** (túnel/Access/deploy key), más la validación en dispositivo
que este spike no pudo hacer. **No hay bloqueantes de arquitectura**;
lo único pendiente antes de un rollout es decidir la colocación del
manifest (opciones A/B de arriba) y correr el checklist en un teléfono.

Bosquejo del plan de build (si el dueño lo aprueba):

- **Código (S, un PR)**: manifest + `rel="manifest"` (+ `theme-color`
  opcional) + `.webmanifest` en `mimeTypes` + actualizar
  `docs/operations/COMMS.md` (quitar el «por defecto no funciona desde el
  teléfono» residual, si aplica) y este registro; ampliar e2e solo si
  aporta (p. ej. 200 del manifest en el server de e2e). Sin service
  worker. Sin tocar la UX de credencial.
- **Ops (M, fuera del repo)**: verificar política Access, ingress/DNS del
  túnel, deploy key en la VM, y correr el checklist de dispositivo.
- **Diferidos** (registrar en el registro del plan 250 por el revisor si
  no se seleccionan ahora): caché offline (recomendado en contra),
  push, Web Share/file handling adicional.

## Referencias

- `admin/content-manager/README.md:33-49` — modo remoto, Access, deploy key.
- `admin/content-manager/src/web/app/credentialStore.ts`,
  `CredentialPrompt.tsx`, `api/requestCore.ts` — credencial y 401.
- `admin/content-manager/src/web/app/comms/` — `handoff.ts`,
  `ShareButton.tsx`, `ComposerPanel.tsx`, `useCommsWorkspace.ts`.
- `admin/content-manager/src/server/app.ts:304-395` — servido del SPA y
  estáticos (incluye el fallback a `assets/` del repo).
- `admin/content-manager/vite.config.ts:11` — `publicDir: false`.
- `admin/content-manager/test/e2e/comms.spec.ts` — «vista móvil».
- `docs/operations/COMMS.md`, `docs/adr/0011-private-whatsapp-comms-module.md`.
- Planes: 217 (parqueo «Acceso móvil / PWA»), 223 (credencial por sesión),
  232 (refresh de docs), 251 (este spike).
