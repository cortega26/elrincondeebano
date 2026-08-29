# ADR 0010: Private funnel measurement contract (spike)

- Status: Decided — no-go (2026-08-27, plan 167). Default remains no-go until owner confirms collector.
- Date: 2026-08-12 (spike) · Decision: 2026-08-27 (plan 167)
- Plan: 038 (spike de medición privada del funnel) · 167 (go/no-go)
- Scope: diseño/contrato únicamente — sin provider, sin transmisión, sin cookies, sin PII

## Context

El runtime activo del storefront emite 5 eventos de funnel a través de
`trackAnalyticsEvent` (`astro-poc/src/scripts/storefront.js`), pero ningún
initializer shipped los consume (`window.__analyticsTrack` ausente → no-op
seguro). Este spike define QUÉ medir y QUÉ está prohibido medir, y compara
opciones — la implementación queda diferida hasta que el owner del negocio
confirme qué decisiones cambiará con los datos y quién es el responsable
legal/privacidad.

## 1. Inventario de eventos activos (Step 1)

| Evento                        | Trigger                                        | Propiedades actuales                                                        | Decisión que podría informar                          | Veredicto                                                                                                                   |
| ----------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `whatsapp_checkout_submit`    | Envío del pedido por WhatsApp (botón checkout) | `items` (conteo), `totalAmount`, `paymentMethod`, `source` (mobile/desktop) | Conversión del checkout y split por canal/dispositivo | **Conservar**, conteo + monto agregado (sin composición)                                                                    |
| `mobile_merchandising_toggle` | Expand/colapsar bloque de merchandising        | `expanded` (bool)                                                           | Engagement del bloque                                 | **Conservar** tal cual (agregado, sin PII)                                                                                  |
| `mobile_cart_shortcut_click`  | Clic en el acceso flotante al carrito          | `source` (fijo)                                                             | Uso del atajo del carrito                             | **Conservar** tal cual                                                                                                      |
| `home_hero_primary_cta_click` | Clic en la CTA principal del hero              | `destination` (ruta URL, p. ej. `/combos/`)                                 | Rendimiento de la CTA                                 | **Rechazar/coarse**: la ruta bruta puede contener datos de usuario — sustituir por slug canónico o `null`                   |
| `mobile_add_to_cart`          | Añadir al carrito desde móvil                  | `id`, `name`, `price` del producto                                          | Popularidad de producto                               | **Rechazar/coarse**: ids/nombres/precios violan el contrato — quedarse con `add_to_cart` (conteo) sin identidad de producto |

Emisores legacy (excluidos): `src/js/main.js` (árbol legacy no shipped por el
storefront Astro; el layout carga `scripts/storefront.js`).

## 2. Restricciones de privacidad (Step 2)

### Datos prohibidos (nunca en un evento)

| Dato                                                                   | Rationale                            |
| ---------------------------------------------------------------------- | ------------------------------------ |
| Nombre, departamento/apartamento, notas, patente                       | Identifican al residente             |
| Mensaje de WhatsApp o su contenido                                     | Texto personal                       |
| IDs de carrito/producto, composición exacta del pedido                 | Reidentificación + detalle de compra |
| IDs persistentes de usuario, cookies, localStorage                     | Sin identidad residente              |
| URLs brutas con datos de usuario (p. ej. destinos con query de pedido) | Fuga de datos en logs                |

### Matriz de propiedades permitidas

| Propiedad                                             | Permitido   | Rationale                                    |
| ----------------------------------------------------- | ----------- | -------------------------------------------- |
| `items` (conteo entero)                               | Sí          | Agregado, sin composición                    |
| `totalAmount` (CLP)                                   | Sí          | Agregado de sesión                           |
| `paymentMethod` (enum fijo)                           | Sí          | Coarse, sin texto libre                      |
| `source` / `expanded` / flags booleanos y enums fijos | Sí          | Coarse                                       |
| `destination` (solo slug canónico conocida)           | Condicional | Prohibido si puede contener input de usuario |
| `id`/`name`/`price` de producto                       | No          | Rechazado por el contrato                    |

### Política de datos

- **Retención**: 90 días rolling para agregados; sin almacenamiento de eventos crudos después de la agregación diaria.
- **Consentimiento/legal**: dueño = maintainer del proyecto; requiere aprobación explícita antes de habilitar transmisión (gate del plan 038).
- **Sampling**: opcional 10 % por sesión si el volumen lo justifica.
- **Borrado**: endpoint/forma de eliminación documentada; sin correlación cruzada con pedidos.
- **Duplicados**: deduplicación por `(eventName, timestamp window, page)`; retry al menos una vez.
- **Script bloqueado**: el no-op actual (`catch {}` + ausencia de `__analyticsTrack`) es el contrato — analítica nunca bloquea checkout ni interacción.

## 3. Comparación de opciones y decisión (Step 3)

| Opción                                                     | Privacidad                      | Operación                             | Costo                       | Confiabilidad   |
| ---------------------------------------------------------- | ------------------------------- | ------------------------------------- | --------------------------- | --------------- |
| Sin medición                                               | Máxima                          | Ninguna                               | 0                           | —               |
| Plausible custom events (cookie-free, ya cargado)          | Buena; datos viajan al provider | Mínima (bridge en `__analyticsTrack`) | Plan ~9 USD/mes o free tier | Media (tercero) |
| Endpoint agregado first-party (edge function o build-only) | Máxima (nunca sale del dominio) | Media (endpoint + agregación)         | Baja                        | Alta            |

**Recomendación**: condicional a **Plausible custom events** con el contrato
estricto (agregado, coarse, sin ids/names/prices/destinos brutos) si el owner
confirma decisiones concretas; **default no-go** hasta esa confirmación — el
valor de decisión actual (5 eventos, sin métricas acordadas) no justifica
todavía el costo de consentimiento/operación. El contrato provider-neutral
queda definido aquí para que cualquier opción futura lo implemente sin
rediseño.

## 4. Contrato de evento provider-neutral

```
trackAnalyticsEvent(name, { coarse properties only per matrix })
whatsapp_checkout_submit: { items: int, totalAmount: CLP int, paymentMethod: enum, source: 'mobile'|'desktop' }
mobile_merchandising_toggle: { expanded: bool }
mobile_cart_shortcut_click: { source: 'floating_shortcut' }
home_hero_primary_cta_click: { destination: canonical slug | null }
mobile_add_to_cart: {}   // conteo únicamente
```

## Consecuencias

- Cualquier implementación futura DEBE: (1) añadir tests unitarios que
  prueben que los campos prohibidos se descartan antes de transmitir, (2)
  E2E que pruebe que el checkout funciona con analytics bloqueado, (3) revisar
  propiedades nuevas como cambios de schema sensibles a privacidad.
- La ausencia de analítica nunca bloquea checkout (no-op actual es el
  contrato).

## Addendum — Decision 2026-08-27 (no-go, plan 167)

- **Decision**: **no-go**. No se implementa endpoint agregado first-party ni
  bridge a Plausible. La medición permanece como contrato provider-neutral
  ( §4 ) sin transmisión.
- **Evidence assembled (spike)**:
  - Captura actual: `observability.initObservability({ enabled: true, slowEndpointMs: 1200 })`
    en cada page load (`storefront.js:1103` pre-decision) → LCP/INP/CLS vía
    `PerformanceObserver`, contadores `error`/`unhandledrejection`, y
    `recordEndpointMetric` (buffer 50, solo `path`+método+status+duración,
    umbral 1200 ms). Salida únicamente `log(...)` → `logger.ts:67-82`
    → `console` del navegador; `OBSERVABILITY.md:70` indica revisar logs
    del navegador sin collector existente.
  - Umbrales de triage: `OBSERVABILITY.md:11-20` — LCP>2.5s, INP>200ms,
    CLS>0.1, fetch crítico >1200 ms, incremento visible de error rate.
  - Funnel: 6 emisores `trackAnalyticsEvent` en `storefront.js`
    (`whatsapp_checkout_submit`, `mobile_merchandising_toggle`,
    `mobile_cart_shortcut_click`, `notify_when_back` (plan 166),
    `home_hero_primary_cta_click`, `mobile_add_to_cart`) → `window.__analyticsTrack`
    nunca instalado → no-op seguro (`try/catch`).
  - Operador: single operator (maintainer). Sin decisiones concretas que
    cambiar con los datos ni responsable legal/privacidad distinto del owner.
  - Costo go: endpoint first-party same-origin + tests de privacidad
    (campos descartados antes de transmitir, checkout nunca bloqueado —
    ADR §2) + operación. Costo no-go: flip `enabled:false`.
  - Drift check `ee20b0f6..HEAD` (2026-08-27): solo `storefront.js` cambió
    (+30 -2, cache de companion + `notify_when_back`); `observability.js`,
    `logger.ts`, `OBSERVABILITY.md` y ADR sin cambios — problema vigente.
  - **Collector check (STOP condition)**: `grep -r __analyticsTrack|beacon|collector`
    sobre `astro-poc/`, `docs/`, `infra/` no reveló endpoint/collector fuera
    del repo. Verificado 2026-08-27.
- **Rationale**: recolectar datos que nadie lee es peor que no recolectar —
  los umbrales crean expectativa de acción sin consumidor. El ADR ya
  recomendaba default no-go hasta confirmación del owner; no hay evidencia
  nueva que justifique el costo de consentimiento/operación para un operador
  único sin métricas acordadas.
- **Branch executed (no-go)**:
  - `astro-poc/src/scripts/storefront.js:1103` → `enabled:false` (observability
    deshabilita `PerformanceObserver` y contadores; `logger.ts` conservado).
  - `trackAnalyticsEvent` API conservada con comentario de revisit (ADR 0010
    §4); emisores retenidos como no-op inertes sin `__analyticsTrack` —
    payload building no transmite (ver comentario en `storefront.js:50`).
  - Re-enable documentado: instalar collector first-party o bridge
    `__analyticsTrack` y volver a `enabled:true` + tests §2.
- **Rollback**: `git revert <sha>` (cambio trivial).
- **Refs**: plan 167, auditoría 10 DIR-06, `OBSERVABILITY.md`, `storefront.js:50,1103`.

## Referencias

- Plan 038: spike (design/decision only — sin cambios de runtime).
- `astro-poc/src/scripts/storefront.js` (emitters), `BaseLayout.astro:106-111`
  (Plausible cookie-free cargado como script normal).
- OBSERVABILITY.md (operaciones existentes; sin contrato de funnel previo).
