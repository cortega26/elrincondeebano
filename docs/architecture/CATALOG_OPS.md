# Operaciones de catálogo sin el admin (entrada headless)

Documento de diseño del spike 295. No cambia el comportamiento actual: describe
un punto de entrada que reutilice las reglas del Content Manager para agentes
sin shell y para el operador.

## 1. Problema

Desde octubre, las ediciones de catálogo llegan como PRs hechas por agentes
remotos vía la API de GitHub; el admin no publica desde el 2026-09-18. Evidencia
recogida el 2026-11-12:

- 20 commits tocaron `data/product_data.json` desde 2026-10-01; 11 PRs de
  catálogo se fusionaron en esa ventana (#488, #489, #492, #493, #509, #510,
  #525, #526, #527, #536, #540).
- Sellos en `field_last_modified`: **180 `git`**, 11 `catalog-maintenance`,
  23 `admin` y 267 `offline` (import inicial). Ni `git` ni
  `catalog-maintenance` los produce código alguno: son reescrituras manuales.
- La PR #525 recalculó a mano "CLP 2.000 − 200 = 1.800"; la #526 creó (y luego
  borró) un workflow de un solo uso con `contents: write` para subir una foto,
  con parámetros AVIF distintos del pipeline canónico.

El coste no es el número de PRs: es que cada agente re-deriva el sellado de
`rev`/`field_last_modified`, los guardas de precio/descuento y el pipeline de
imágenes. Un núcleo que reutilice `ProductService` y el pipeline canónico
elimina esa clase de divergencia sin dar más permisos de los necesarios.

## 2. Superficies candidatas

| Opción | Qué es                                                      | Ventaja                                                             | Coste / riesgo                                                           |
| ------ | ----------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| A      | CLI `npm run catalog:op` para agentes con shell             | Reutiliza el dominio tal cual; fácil de testear                     | Los agentes observados **no tienen shell**: llegan por la API de GitHub  |
| B      | `workflow_dispatch` con inputs tipados que abre una rama/PR | Sirve al caso real sin shell; permisos acotados y auditables        | Un workflow más; los PRs con `GITHUB_TOKEN` no disparan CI (ruleset 281) |
| C      | Núcleo compartido + A y B como adaptadores finos            | Una sola implementación de reglas; cada superficie elige su entrada | Más piezas que mantener; el núcleo debe ser puro y estable               |

**Recomendación: C, empezando por B.** El caso observado es un agente sin shell
que ya opera contra la API; B lo cubre sin exigir un runner. A sigue siendo útil
para el operador y para reproducir un cambio localmente. Ambas deben compartir
un único núcleo (`catalog-op`) y no duplicar validaciones.

## 3. Contrato del núcleo

Entrada:

```json
{
  "id": "p-7a7d9d85683f",
  "field": "price",
  "value": 3600,
  "baseRevision": 3
}
```

Salida:

```json
{
  "ok": true,
  "changedFields": ["price"],
  "before": { "price": 3000, "rev": 3 },
  "after": { "price": 3600, "rev": 4 },
  "catalog": { "rev": 46, "last_updated": "…" }
}
```

- Reutiliza `ProductService.edit(catalog, { entityId, baseRevision, changes })`
  (`admin/content-manager/src/domain/products/productService.ts`): zod, guardas
  de precio/descuento, sellado de `rev` y de `field_last_modified`, y bump de
  `catalog.rev`/`last_updated` ya viven ahí. No se copian.
- `baseRevision` es el `rev` del producto leído; un valor viejo devuelve 409 y
  no escribe.
- `by`: propuesta **`"cli"`** (el esquema acepta cualquier string no vacío). No
  se imita `"admin"` porque el origen de la edición debe ser distinguible; hoy
  `ProductService` lo fija a `"admin"` — ver la brecha en el resultado del
  spike.
- El núcleo es puro respecto al transporte: recibe un catálogo ya parseado,
  devuelve el catálogo validado y no habla HTTP ni React.

## 4. Imágenes

Camino canónico: `npm run images:avif` (`tools/sync-avif-assets.js`, quality 50,
effort 4) y `npm run images:gap-fill`
(`tools/gap-fill-image-variants.js`). El admin genera AVIF con quality 60
(`admin/content-manager/src/server/services/mediaJobs.ts`). **Decisión
pendiente:** unificar 50 vs 60 antes de aceptar fotos por una superficie nueva.

Si se acepta una URL remota:

- allowlist de dominios (nunca URLs arbitrarias);
- tope de tamaño y timeout;
- verificación de magic bytes reutilizando el sniffing de
  `admin/content-manager/src/server/routes/mediaUploadRoutes.ts`
  (`MAGIC_BYTES`, no confiar en `Content-Type`);
- la imagen entra al pipeline canónico y se commitea junto al cambio de
  catálogo;
- **nunca** se crea un workflow con permisos de escritura por cada foto (caso
  #526).

## 5. Seguridad del modo (B)

- Permisos mínimos: `contents: write` y `pull-requests: write` solo si el token
  puede abrir PRs; si no, el workflow empuja una rama y deja el enlace de
  comparación en `$GITHUB_STEP_SUMMARY`.
- Inputs del `workflow_dispatch` (id, campo, valor, `baseRevision`) pasan por
  `env:`; ningún `${{ }}` interpolado dentro de un bloque `run:`.
- Solo rama nueva (`bot/catalog-op-<run_id>`) + PR; nada de push a `main`.
- Interacción con el ruleset del plan 281: los PRs abiertos con `GITHUB_TOKEN`
  no disparan CI. Si se usa ese token, el flujo correcto es rama + enlace para
  que una persona abra el PR (mismo patrón que `images.yml` tras el plan 280).
- Sin secretos en inputs: el valor de un campo de catálogo no es un secreto,
  pero no se aceptan URLs con credenciales.

## 6. Preguntas abiertas

| Pregunta                                                                    | Dueño      |
| --------------------------------------------------------------------------- | ---------- |
| ¿Se adopta `by: "cli"` (o `"workflow"`) y se parametriza en ProductService? | Ingeniería |
| ¿B debe abrir PR o solo empujar rama y dejar el enlace?                     | Operador   |
| ¿La ingestión de fotos por URL entra en el alcance o queda para otro plan?  | Operador   |
| ¿Se unifica AVIF q50 (CLI) y q60 (admin) en un solo valor?                  | Ingeniería |
| ¿Qué dominios entran en la allowlist de fotos remotas?                      | Operador   |
| ¿A y B comparten exactamente los mismos campos editables?                   | Ingeniería |

## 7. Plan de construcción propuesto

1. **Plan A (S–M):** parametrizar `by` en `ProductService` y extraer el núcleo
   `catalog-op` con tests de contrato; adaptador CLI.
2. **Plan B (S–M):** `workflow_dispatch` con inputs tipados, branch + enlace de
   PR, permisos mínimos y tests de construcción del workflow.
3. **Plan C (M, opcional):** ingestión de imágenes por URL con allowlist,
   sniffing y paso por el pipeline canónico.

## Resultado del spike

- **Funcionó:** el prototipo `admin/content-manager/scripts/catalog-op.ts`
  reutiliza `ProductService.edit` sin dependencias de Fastify/React, valida con
  zod, hace dry-run por defecto y escribe de forma atómica con
  `writeJsonFileAtomic`. El test de contrato cubre dry-run inmutable, write con
  sellado de `rev`/`last_updated` y el guard de descuento > precio.
- **Faltó:** parametrizar `by` (hoy `ProductService` fija `"admin"`); decidir
  q50 vs q60; definir la allowlist de imágenes. Nada de esto bloquea la
  recomendación.
- **Recomendación final:** construir el núcleo compartido y el adaptador B
  (`workflow_dispatch` → rama + enlace de PR). El CLI queda como herramienta
  local para el operador.
