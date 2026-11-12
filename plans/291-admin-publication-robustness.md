# Plan 291: Publicación del admin honesta — pull fallido no es "✓", commit sin push no es "completado", y los timers largos sí disparan

> **Executor instructions**: Sigue este plan paso a paso. Ejecuta cada
> comando de verificación y confirma el resultado esperado antes de pasar
> al siguiente paso. Si ocurre algo en la sección "STOP conditions",
> detente y reporta — no improvises. Al terminar, actualiza la fila de
> estado de este plan en `plans/README.md` — salvo que un reviewer te haya
> despachado y te haya dicho que mantiene el índice.
>
> **Drift check (run first)**: `git diff --stat 6d0a29af..HEAD -- admin/content-manager/src/server/routes/publication.ts admin/content-manager/src/server/services/jobRunner.ts admin/content-manager/src/web/app/routes/PublicationPage.tsx admin/content-manager/src/server/adapters/gitAdapter.ts`

## Status

- **Priority**: P3 (el admin no publica desde el 2026-09-18; con el plan 284 su publicación vuelve a pasar CI, así que estos defectos vuelven a importar)
- **Effort**: M (cinco arreglos S en el mismo archivo — serializados en un plan)
- **Risk**: LOW–MED
- **Depends on**: `plans/284-generated-catalog-copies.md` (recomendado antes: sin él, toda publicación del admin deja CI rojo y no se puede validar end-to-end)
- **Category**: bug
- **Planned at**: commit `6d0a29af`, 2026-11-12 (Auditoría 13)

## Why this matters

La publicación (commit + push del catálogo) y la publicación programada
(plan 248) informan estados que no son ciertos:

1. Un `git pull` que falla (conflicto de rebase, non-fast-forward, red) se
   muestra como **"Pull ✓"**, y la pista de recuperación
   (`git rebase --abort`) nunca llega al operador.
2. Tras un crash entre el commit y el push, la recuperación de arranque marca
   la publicación programada como **completada** (hay commit) aunque nunca se
   empujó: el operador cree que el sitio cambió.
3. La recuperación de arranque **espera** (await) una publicación completa
   dentro del registro del plugin de Fastify (timeout por defecto 10 s); si
   tarda más, el proceso sale con `exit(1)` a mitad de publicación — justo el
   crash del punto 2.
4. Una publicación programada a más de ~24,8 días se dispara al instante
   (límite de `setTimeout`), `claim()` la rechaza por no estar vencida, el job
   se marca "completed" y la entrada queda `pending` sin timer: **nunca ocurre**.
5. Cancelar una publicación en curso puede informar "cancelada" cuando el
   commit (o el push) ya ocurrió, y borra la entrada durable con su evidencia.

## Current state

- `admin/content-manager/src/server/routes/publication.ts`:
  - `runPublicationJob` (≈80-180): `checkCancel()` después del commit (línea ~131) y después de un push exitoso (~160).
  - Pull (≈386-401): el job **retorna** `{ success: false, error }` en vez de lanzar:
    ```ts
    const job = jobRunner.schedule<{ success: boolean; output?: string; error?: string }>(
      'git-pull',
      async () => {
        const result = await git.pull();
        if (result.success) {
          return { success: true, output: result.output };
        }
        const recovery = /conflict|CONFLICT/i.test(result.error ?? '')
          ? ' Conflicto durante el rebase: ejecuta `git rebase --abort` para recuperar.'
          : '';
        return { success: false, error: `${result.error ?? 'Git pull failed'}${recovery}` };
      }
    );
    ```
  - `resolveCrashedPublication` (≈257-276): `committed` = SHA en el log o marcador de idempotencia → `complete(...)`; no mira `entry.push`.
  - `recoverScheduledPublications` (≈286-312): `await resolveCrashedPublication(...)` y, para cada `claimDue(...)`, `await fireClaimedPublication(...)`.
  - Al final de `publicationRoutes` (≈598-606): `if (options.enableWrites) { try { await recoverScheduledPublications(deps); } catch … }` — dentro del registro del plugin (`registerRoutes.ts:~155-163`, `app.register(async function (instance) { await publicationRoutes(...) })`). `app.ts` no cambia `pluginTimeout` (default Fastify 10 000 ms); `start.ts:~93-95` hace `process.exit(1)` si `listen` falla.
  - Cancel (≈560-590): `jobRunner.cancelJob(id)` y luego **siempre** `options.scheduledPublications.remove(id)`.
- `admin/content-manager/src/server/services/jobRunner.ts`:
  - `systemClock.schedule = (cb, ms) => setTimeout(cb, ms)` (línea 24).
  - `scheduleAt` (≈70-104): `const delay = Math.max(0, when.getTime() - this.clock.now());` → `this.clock.schedule(..., delay)` sin tope (Node trunca a 1 ms si `delay > 2^31-1`).
  - `processQueue` (≈150-185): si `job.cancelRequested` tras `await fn()` exitoso → `status = 'cancelled'` (aunque el trabajo se hizo); si `fn` lanza → `failed` (o `cancelled` si se pidió cancelar).
- `admin/content-manager/src/web/app/routes/PublicationPage.tsx:~238-252` — polling del pull:
  ```tsx
  if (jobState.status === 'completed') {
    const output = (jobState.result as { output?: string } | undefined)?.output ?? '';
    setPullStatus(output ? `Pull ✓ — ${output}` : 'Pull ✓');
    await refreshGitStatus();
  } else if (jobState.status === 'failed') {
    const msg = (jobState.result as { error?: string } | undefined)?.error ?? 'Pull fallido';
    setPullStatus(msg);
  }
  ```
  (los jobs `failed` llevan el mensaje en `jobState.error`, no en `result.error`).
- `gitAdapter.ts`: `push(remote='origin', branch?)` (143); `getChanges()` devuelve `ahead`/`behind` (166-215).
- Tests ejemplares: `admin/content-manager/test/integration/publicationRecovery.test.ts`,
  `publicationDurability.test.ts` (reloj falso + outbox), `test/contract/jobRunner.test.ts`,
  `test/contract/scheduledPublications.test.ts`; web: tests junto a `PublicationPage` (busca `PublicationPage*.test.tsx`).

## Commands you will need

| Purpose     | Command                                                                                                                                 | Provenance | Expected on success |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------- |
| Install     | `HUSKY=0 npm ci`                                                                                                                        | declared   | exit 0              |
| Admin foco  | `npm -w admin/content-manager exec vitest run test/integration/publication test/contract/jobRunner test/contract/scheduledPublications` | declared   | verde               |
| Admin suite | `npm run admin:test`                                                                                                                    | declared   | verde               |
| Typecheck   | `npm run admin:typecheck`                                                                                                               | declared   | exit 0              |
| Lint        | `npm run admin:lint`                                                                                                                    | declared   | exit 0              |
| E2E admin   | `npm run admin:test:e2e`                                                                                                                | declared   | verde               |

## Scope

**In scope**:

- `admin/content-manager/src/server/routes/publication.ts`
- `admin/content-manager/src/server/services/jobRunner.ts` (solo `scheduleAt`)
- `admin/content-manager/src/web/app/routes/PublicationPage.tsx` (solo el manejo del pull)
- Tests bajo `admin/content-manager/test/` (nuevos casos)

**Out of scope**:

- Semántica general de `processQueue` (otros tipos de job dependen de ella).
- Exclusión mutua entre la validación `images:avif` y ediciones concurrentes (ver Deferred).
- UI nueva más allá de mostrar `ahead` y el botón de push pendiente (Step 5).

## Git workflow

- Branch: `advisor/291-admin-publication-robustness`.
- Un commit por step: `fix(admin): surface failed git pulls as failures (plan 291)`, etc.

## Steps

### Step 0: Baseline

Install, admin foco, admin suite, typecheck, lint.

### Step 1: Pull fallido = job fallido

En el job `git-pull`: si `!result.success`, **lanza** `new Error(\`${result.error ?? 'Git pull failed'}${recovery}\`)`.
En `PublicationPage.tsx`, rama `failed`: `const msg = jobState.error ?? 'Pull fallido';`(tipa`jobState.error`según el cliente; si el tipo no lo expone, léelo como en otras páginas que muestran`job.error`— busca`\.error`sobre jobs en`src/web`).
Tests: integración — pull con el adapter git falso devolviendo `{ success:false, error:'CONFLICT …' }`→ job`failed`con error que contiene`git rebase --abort`; web — mock de `getJob`en`failed`con`error`→ el texto mostrado es ese error, nunca`Pull ✓`.

**Verify**: tests nuevos rojo→verde (demuéstralo); admin foco verde.

### Step 2: Commit sin push ≠ completado

En `resolveCrashedPublication`: si `committed && entry.push`, verifica el push con
`(await deps.git.getChanges()).ahead === 0`. Si `ahead > 0` (o `getChanges` falla) →
`deps.scheduledPublications.fail(entry.job_id, 'committed_not_pushed: el commit <sha> existe localmente pero no se empujó; usa "Empujar commits pendientes"')`.
Si `ahead === 0` → `complete(...)` como hoy. Para `entry.push === false` → comportamiento actual.
Test en `publicationRecovery.test.ts`: entrada `firing` con commit en el log, `push: true`, git falso con `ahead: 1` → `failed` con `committed_not_pushed`; con `ahead: 0` → `completed`.

**Verify**: rojo→verde; foco verde.

### Step 3: La recuperación de arranque no bloquea el registro

En `recoverScheduledPublications`, mantén síncronos (await) los pasos baratos
(re-armar pendientes futuros y `resolveCrashedPublication`), pero **no** esperes los disparos:
para cada entrada de `claimDue(...)`, encola con
`deps.jobRunner.schedule('publication', () => fireClaimedPublication(deps, claimed))`
(el runner es FIFO de un trabajo a la vez — mismo aislamiento que hoy). El `catch` silencioso se vuelve innecesario
(el job queda `failed` con su error, visible en `/jobs`); conserva el registro en el outbox que ya hace `fireClaimedPublication`.
Test: con un `fireClaimedPublication` que tarda (git falso con push que espera 15 s de reloj real o una promesa que no resuelves hasta el final del test),
`createApp(...)`/`app.ready()` resuelve en < 1 s y el job aparece en `/jobs` como `pending|running`.

**Verify**: test verde; `publicationDurability.test.ts` sigue verde (exactly-once intacto).

### Step 4: Timers de más de 24,8 días

En `JobRunner.scheduleAt`: `const MAX_TIMER_MS = 2_147_483_647;`. Si `delay > MAX_TIMER_MS`,
programa un timer intermedio de `MAX_TIMER_MS` que, al vencer, vuelve a evaluar el delay restante y re-arma
(misma entrada en `this.timers` bajo el mismo `job.id`, para que `cancelJob` lo siga limpiando). Solo al llegar
a `delay <= MAX_TIMER_MS` programa el disparo real. No cambies la firma.
Test en `test/contract/jobRunner.test.ts` con el reloj falso existente: `scheduleAt` a 30 días → tras avanzar 25 días no se ejecutó;
tras 30 días + 1 ms se ejecutó una vez; cancelar a los 26 días evita la ejecución.

**Verify**: verde.

### Step 5: Cancelar no miente y el push pendiente se puede reintentar

1. Ruta de cancel: si el job existe, es de tipo `'publication'` y está `running` → 409
   `{ code: 'PUBLICATION_IN_PROGRESS', message: 'La publicación ya está en curso y no puede cancelarse; espera a que termine.' }`
   **sin** llamar `cancelJob` ni `remove`. Para jobs `pending` → como hoy (cancel + `remove`).
2. En `runPublicationJob`, elimina el `checkCancel()` que sigue al commit y el que sigue al push (pasado el commit ya no se cancela).
3. Push pendiente: añade `POST /git/push-pending` (mismo patrón de auth/escritura y de `jobRunner.schedule` que la ruta de pull):
   si `(await git.getChanges()).ahead > 0` → `git.push()` y devuelve el job; si `ahead === 0` → 409 `NOTHING_TO_PUSH`.
   Declárala en `openapi.ts` (el guard de completitud del plan 252 lo exige; regenera tipos con el script que use el repo — busca "openapi" en `admin/content-manager/package.json`).
   En `PublicationPage.tsx`, muestra `ahead` en el panel de estado git y un botón "Empujar commits pendientes" visible solo si `ahead > 0`.
4. Tests: cancel de una publicación `running` → 409 y la entrada del outbox sigue; `push-pending` con `ahead: 1` → job `completed`, con `ahead: 0` → 409.
5. Tests existentes afectados (actualízalos, es parte del alcance): `test/integration/publication.test.ts:~212-221`
   (`expect(cancelResponse.statusCode).toBe(200)` tras cancelar una publicación recién lanzada) y
   `test/integration/publicationE2E.test.ts:~186-206` (`E2E: job cancellation marks job as cancelled`).
   Hazlos deterministas: bloquea el primer job con una publicación previa en curso (o un git falso que no
   resuelve) para que el job a cancelar esté **`pending`** → asserta 200 + `cancelled` exacto; y añade el caso
   `running` → 409. No aceptes listas de estados "cualquiera" (`['cancelled','failed','completed']`).

**Verify**: foco + suite + typecheck + lint verdes; el test de completitud OpenAPI verde.

### Step 6: Regresión

Admin suite, E2E admin.

## Test plan

- 1 test de pull fallido (integración) + 1 web; 2 de recuperación commit-sin-push; 1 de arranque no bloqueante;
  3 casos de timer largo; 4 de cancel/push-pending. Los marcados rojo→verde, demostrados en el informe.

## Done criteria

- [ ] `grep -n "return {\s*success: false" admin/content-manager/src/server/routes/publication.ts` → sin match en el job de pull
- [ ] `grep -n "committed_not_pushed" admin/content-manager/src/server/routes/publication.ts` → match
- [ ] `grep -n "await fireClaimedPublication" admin/content-manager/src/server/routes/publication.ts` → solo dentro de jobs encolados (no en el bucle de arranque)
- [ ] `grep -n "2_147_483_647" admin/content-manager/src/server/services/jobRunner.ts` → match
- [ ] Admin suite, typecheck, lint, E2E admin verdes
- [ ] `git diff --name-only main...HEAD` ⊆ In scope (+ `openapi.ts`/tipos generados del Step 5.3); fila 291 en `plans/README.md`

## STOP conditions

- `publicationDurability.test.ts` (exactly-once del plan 248) falla tras el Step 3.
- `getChanges()` no reporta `ahead` fiable en el repo temporal de los tests (reporta; no simules con `git rev-list` ad hoc sin acordarlo).
- El guard OpenAPI exige cambios en archivos no listados más allá de `openapi.ts` y sus tipos generados.
- Cualquier cambio requeriría tocar `processQueue`.

## Maintenance notes

- Nuevos tipos de job que hagan efectos externos irreversibles deben seguir la regla del Step 5: no se cancelan una vez iniciados.
- **Deferred:** `images:avif` (child de la validación) reescribe `data/product_data.json` con una lectura previa y sin el lock del repositorio — una edición guardada durante la validación puede perderse. Requiere un "gate de publicación" para rutas de escritura o un chequeo de `rev` en `tools/sync-avif-assets.js`. Se reabre si el admin vuelve a usarse para publicar con frecuencia.
