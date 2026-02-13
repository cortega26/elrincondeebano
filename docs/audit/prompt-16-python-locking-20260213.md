# Prompt 16 - Python locking reproducible (2026-02-13)

## Objetivo

Eliminar el riesgo P1 de dependencias Python admin sin pinning estricto, garantizando instalaciones reproducibles en CI y auditoria de seguridad sobre un grafo estable.

## Cambios aplicados

1. Lockfile Python admin:
   - Se agrego `admin/product_manager/requirements.lock.txt` con versiones fijadas.
2. Entrada de dependencias Python:
   - `admin/product_manager/requirements.txt` mantiene dependencias top-level y documenta instalacion con constraints (`-c requirements.lock.txt`).
3. CI de admin:
   - `.github/workflows/admin.yml` ahora:
     - cachea usando `requirements.txt` y `requirements.lock.txt`;
     - instala con `pip install -r requirements.txt -c requirements.lock.txt`;
     - ejecuta `python -m pip check` antes de `pytest`.
4. Auditoria de seguridad Python:
   - `.github/workflows/security-audit.yml` prioriza `pip-audit` sobre `requirements.lock.txt` (fallback a `requirements.txt` si falta lock).
5. Documentacion operativa:
   - `AGENTS.md` actualizado con Prompt 16 y comando canonico de `pip-audit` sobre lock.
   - `docs/operations/DEPENDENCY_POLICY.md` actualizado para incluir lock Python y gates de verificacion.
   - `docs/README.md` indexa este reporte de Prompt 16.
6. Estabilizacion de tests (hallazgo durante gate):
   - `test/fetchProducts.spec.js` dejo de depender de `Storage.prototype` y usa `localStorage` mock explicito con `vi.stubGlobal(...)`.
   - Se agrego `vi.unstubAllGlobals()` en `afterEach` para evitar contaminacion entre specs.

## Evidencia de verificacion

Verificacion Python (Python 3.12 en entorno limpio):

1. `python -m pip install --upgrade pip` -> OK.
2. `python -m pip install -r admin/product_manager/requirements.txt -c admin/product_manager/requirements.lock.txt` -> OK.
3. `python -m pip check` -> OK ("No broken requirements found.").
4. `python -m pytest` (en `admin/product_manager`) -> OK (`29 passed`).
5. `python -m pip_audit -r admin/product_manager/requirements.lock.txt` -> OK (`No known vulnerabilities found`).

Verificacion Node (post-cambio):

1. `npm run lint` -> OK.
2. `npm run typecheck` -> OK.
3. `npm test` -> OK (incluyendo `test/fetchProducts.spec.js` en verde).
4. `npm run build` -> OK.

## Riesgos restantes

1. P2: deteccion automatica de assets huerfanos aun no integrada como gate.
2. P2: evidencia persistente de smoke manual por release (plantilla/checklist automatizable).

## Rollback

1. Revertir commit/PR de Prompt 16 (`git revert <sha>`).
2. Revalidar baseline:
   - `npm run lint`
   - `npm run typecheck`
   - `npm test`
   - `npm run build`
3. En admin, volver temporalmente a instalacion sin constraints solo para restaurar servicio mientras se corrige lock.
