# Plan 260: `fetch-fonts` — modo remoto roto y extractor de URLs entrecomilladas (fila 11)

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat c72f786a..HEAD -- tools/fetch-fonts.mjs docs/operations/DEFERRALS.md`

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW–MED (depende de red en la verificación remota)
- **Depends on**: 234 (landed), 255 (landed)
- **Category**: bug / tooling
- **Planned at**: commit `c72f786a`, 2026-10-19

## Why this matters

Dos bugs encadenados dejan `npm run fonts` inútil (fila 11 del registro,
evidencia del plan 234):

1. `extractWoff2Url` exige `.woff2` **pegado al `)`**: con las URLs locales
   entrecomilladas del CSS pinneado (`url('./archivo.woff2')`,
   `assets/fonts/fonts.css:5,12,19,26,33`) el regex no matchea → 5 warnings
   "No woff2 URL inside block" y **no-op**.
2. En modo remoto el fetch usa `User-Agent: Mozilla/5.0` (plano) →
   Google sirve **TTF**; aunque el extractor matcheara, `downloadRemote`
   rechaza non-woff2.

Los bytes woff2 live verificados en el 234 son **idénticos** al archivo
commiteado: `md5 cd56e2ec63d7a63df092f824f981253c`
(`assets/fonts/archivo.woff2`, 34 928 B). Esa es la aceptación del modo
remoto.

## Current state

- `tools/fetch-fonts.mjs` (244 líneas):
  - `extractWoff2Url` (~:120): `block.match(/url\(([^)]+\.woff2)\)/i)`.
  - `loadFontsCss()`: orden `FONTS_CSS_PATH` → `assets/fonts/fonts.css`
    (existe, es el default) → remoto (`ALLOW_REMOTE_FONTS=1`).
  - Fetch con UA plano en `:87` (CSS de Google) y `:166` (fuente).
  - `downloadRemote`: valida https + allowlist de hosts + `.woff2` en
    `pathname`; `copyLocal` hace early-return si source === dest.
  - Dedupe de destinos (plan 234): las cinco pesos escriben
    `assets/fonts/archivo.woff2` una vez.
- Script: `npm run fonts` → `node tools/fetch-fonts.mjs`.

## Commands you will need

| Purpose     | Command                                                       | Provenance | Expected on success                |
| ----------- | ------------------------------------------------------------- | ---------- | ---------------------------------- |
| Instalar    | `HUSKY=0 npm ci`                                              | declared   | exit 0                             |
| Repro local | `npm run fonts`                                               | declared   | hoy: 5 warnings (bug)              |
| Remoto      | `ALLOW_REMOTE_FONTS=1 npm run fonts` (con fonts.css apartado) | declared   | descarga woff2                     |
| md5         | `md5sum assets/fonts/archivo.woff2`                           | declared   | `cd56e2ec63d7a63df092f824f981253c` |
| Lint tools  | `npx eslint tools/fetch-fonts.mjs`                            | declared   | exit 0                             |
| Tests       | `CI_SKIP_BUILD_CONTRACT=1 npm test`                           | declared   | all pass                           |

## Scope

**In scope**:

- `tools/fetch-fonts.mjs` (extractor + UA constante; ajuste mínimo de
  `findFontFaceBlock` **solo si** el CSS live lo exige — ver Step 3).
- `docs/operations/DEFERRALS.md` (fila 11 → Resolved).

**Out of scope**:

- `assets/fonts/fonts.css` y los woff2 (los bytes pinned no cambian).
- Otros tools; workflows.

## Git workflow

- Branch: `advisor/260-fetch-fonts-remote`
- Commits: `fix(tools): accept quoted woff2 urls and fetch with a modern UA (plan 260)`
  y `docs(ops): resolve the fetch-fonts register row (plan 260)`.
- No push, no PR.

## Steps

### Step 0: Baseline y reproducción

Instala. `npm run fonts` → registra los 5 warnings (bug del extractor).
`md5sum assets/fonts/archivo.woff2` → debe ser el esperado.

### Step 1: Extractor

Acepta URLs entrecomilladas conservando las no entrecomilladas, p.ej.
`/url\(\s*['"]?([^)'"]+\.woff2)['"]?\s*\)/i` (grupo con la ruta, luego
`normalizeFontUrl` limpia). Cuida: URLs de Google llevan query
(`?v=...`) después de `.woff2`? No hoy, pero `downloadRemote` ya valida
`pathname`; el regex debe aceptar cualquier cosa tras `.woff2` dentro de
la URL hasta la comilla/paréntesis: usa `([^)'"]+?\.woff2[^)'"]*)` si
hace falta.

**Verify**: `node tools/fetch-fonts.mjs` (modo local default) → **cero**
warnings "No woff2 URL"; exit 0; cinco líneas de procesamiento.

### Step 2: UA moderna (constante única)

Define `const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'`
(o similar moderna) y úsala en **ambos** fetch (`:87` CSS y `:166`
fuente). Documenta el porqué (Google sirve woff2 solo a UAs modernas;
TTF con UA plana).

### Step 3: Verificación remota (la aceptación)

1. Aparta el CSS local temporalmente (`mv assets/fonts/fonts.css /tmp/...`).
2. `ALLOW_REMOTE_FONTS=1 npm run fonts` → debe descargar sin warnings.
3. `md5sum assets/fonts/archivo.woff2` → **`cd56e2ec63d7a63df092f824f981253c`**.
4. `git status` → el woff2 **no cambia** (bytes idénticos); restaura el CSS.
5. **Si** el CSS live de Google (con la UA moderna) devuelve bloques que
   `findFontFaceBlock` no reconoce (p.ej. `font-weight: 100 900` en un
   único bloque variable), aplica el ajuste **mínimo** para reconocer el
   rango y documenta el cambio; si el cambio mínimo no es evidente, STOP.

**Verify**: md5 exacto + git status limpio del woff2 + CSS restaurado
(puedes comparar con HEAD).

### Step 4: Verificación local (dos caminos)

- Default: `npm run fonts` → sin warnings (source === dest ⇒ copyLocal
  no-op; correcto).
- Copia: en `/tmp/opencode` monta un dir con un `fonts.css` y un woff2 de
  prueba; `FONTS_CSS_PATH=/tmp/.../fonts.css npm run fonts` → copia al
  destino; md5 del destino = md5 de la fuente; restaura el estado
  (copia de vuelta del archivo real si el test lo pisó).

### Step 5: Gates + registro

**Verify**: `npx eslint tools/fetch-fonts.mjs` exit 0; `CI_SKIP_BUILD_CONTRACT=1 npm test`
verde; `npm run guardrails:assets` exit 0; `git status` limpio (el
woff2 commiteado intacto). Mueve la fila 11 a Resolved citando el commit
del fix + "plan 260" + la evidencia md5.

## Test plan

- La aceptación remota es el md5 de los bytes live (fuerte y
  machine-checkable).
- Caminos local default + local copia cubiertos por corridas reales.
- No se añaden tests unitarios (la herramienta es un script de red;
  cubrir con corridas documentadas).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Local: `npm run fonts` sin warnings "No woff2 URL"; exit 0
- [ ] Remoto: descarga con md5 `cd56e2ec63d7a63df092f824f981253c`; `git status` sin cambios en el woff2
- [ ] UA moderna en ambos fetch, constante única documentada
- [ ] eslint del archivo + tests + guardrails verdes
- [ ] Fila 11 movida a Resolved
- [ ] Fila de `plans/README.md` actualizada (salvo despacho con override)

## STOP conditions

- Red bloqueada o Google cambia el shape del CSS más allá del ajuste
  mínimo documentado — reportar con el CSS observado.
- El md5 live difiere del registrado — reportar ambos md5 y los bytes
  (NO commitear fuentes nuevas sin decisión del reviewer).
- El fix del extractor rompe el camino remoto (regex demasiado laxa) —
  reportar.

## Maintenance notes

- Reviewer: confirma md5, el `git status` del woff2, que el CSS local
  quedó byte-idéntico y que la UA no debilita las validaciones
  (allowlist/https/woff2 siguen intactas).
