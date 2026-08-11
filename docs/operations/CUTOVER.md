# Cutover — TypeScript Content Manager (completado)

- Plan: 055 Phase 12 → plan 069 (gate terminal)
- Cutover completado: 2026-08-11
- Frontera de rollback: tag `v1.x-python-final`

## Estado actual

El Content Manager TypeScript (`admin/content-manager/`) es la única
aplicación de administración activa del repositorio. El fallback
Python/Tkinter (`admin/product_manager/`) fue retirado de forma reversible
(plan 069, Step 6): su último commit con código activo está taggeado como
`v1.x-python-final` y el commit de retiro es revertible con `git revert`.

La certificación del release candidate se registra en
`reports/certification/certification-<ts>.json` (artefacto local, no
versionado — `.gitignore` excluye `reports/`). El gate `npm run admin:certify`
reporta READY solo cuando las 30 filas están evidenciadas:

- 8 checks automatizados (typecheck, unit+integration, coverage, build,
  shadow-read, parity, e2e-smoke, doctor), re-ejecutados sobre el SHA actual.
- 16 filas de paridad mapeadas a las suites de test que las ejercitan.
- 2 filas manuales resueltas desde
  `reports/certification/evidence/operator-acceptance.json` (aceptación
  firmada del maintainer) y `rollback-drill.json` (8 drills de fallo/rollback
  sobre repos temporales desechables).

`Admin Tools CI` (`.github/workflows/admin.yml`) corre lint, typecheck,
vitest, coverage, build, E2E Playwright (smoke + import + change-sets +
media + storefront), drills de rollback y `npm audit --omit=dev`, cerrados
por el certification report en modo `--ci`.

## Verificación de clean-clone (plan 069 Step 2)

Desde un clone limpio del repo (con el estado del release candidate):

```bash
npm ci
npm run admin:validate   # typecheck + test + build + parity
npm run admin:certify    # 30/30 READY (aceptación firmada + drills)
npm run validate         # lint + typecheck + selectors + build + test + guardrails
npm run validate:release # añade e2e storefront + monitor share-preview
```

Dos corridas consecutivas en 2026-08-11: cero diferencias sin explicar,
sin reparación manual de JSON/filesystem.

## Rollback (retiro reversible)

El commit de retiro de Python es un commit aislado y revertible:

```bash
# Restaurar el fallback Python desde el tag
git checkout v1.x-python-final -- admin/product_manager/
cd admin/product_manager && python -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python content_manager.py

# O revertir el commit de retiro completo
git revert <python-retirement-commit>
```

No se requiere migración inversa de datos: el manager TS escribe el mismo
formato canónico `data/product_data.json` que Python.

## Operación canónica

- `npm run admin:dev` — desarrollo.
- `npm run admin:start` — arranque de producción (`ADMIN_MODE=operator`).
- `npm run admin:doctor` — diagnóstico con remedios.
- `npm run admin:certify` / `admin:parity` — evidencia de certificación.

`data/backups/` contiene snapshots pre-cutover para recuperación.
