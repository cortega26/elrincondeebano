# Plan 082 — Todo

Spec: `plans/082-resolve-admin-ci-and-dep-audits.md`. Estado a 2026-08-11:
la parte de dependencias ya quedó resuelta (`npm audit --omit=dev` → 0
vulnerabilities); falta retirar `test-web`/`admin/web` y gatear el workspace.

- [x] Drift check (`git diff --stat 30dbab7..HEAD` + "Current state" vs vivo)
- [x] Confirmar `npm audit --omit=dev` → 0 vulns (ya resuelto)
- [x] Step 1: quitar job `test-web` de `admin.yml`
- [x] Step 1: `git rm -r admin/web` + copia en `_archive/admin-web/` (gitignored)
- [x] Step 1: actualizar "Files affected" del retirement notice
- [x] Step 4: añadir `npm audit --omit=dev` al job `test-ts`
- [x] Step 5: verificación completa (admin:typecheck, admin:test, admin:build:web, parity)
- [x] Commit por concern (ci según rama del plan)
- [x] `plans/README.md`: fila 082 → DONE + `git mv` del plan a `archive/`
