# Plan 061 — Todo

Spec: `plans/061-complete-operator-workflows.md`. Drift (2026-08-11): doctor
CLI existe (`scripts/doctor.ts`); sin filtros min/max, sin duplicate, sin Git
pull, sin prefs/help; create form ya tiene discount/image pero no los envía en
create y no tiene campo AVIF.

- [x] Drift check + inventario (form, filtros, doctor CLI, git adapter)
- [x] Step 1: filtros min/max price (repo → ruta → client → URL state → UI)
- [x] Step 1: create con todos los campos (discount + image + avif)
- [x] Step 1: duplicate (create-from-copy, identidad fresca, confirmación de nombre)
- [x] Step 1: tests integración (filtros, full-field create, duplicate)
- [ ] Step 2: git pull seguro (preflight dirty/conflicted + `pull --rebase` + refresh)
- [ ] Step 2: tests temp-repo (success, no-op, dirty, conflicted)
- [ ] Step 3: doctor como API + UI + redacción de secretos
- [ ] Step 4: preferencias persistidas + shortcuts + ayuda
- [ ] E2E operator (filtros URL, duplicate, pull, doctor, prefs)
- [ ] Verificar: admin:test/typecheck/build, npm test, e2e
- [ ] README fila 061 → DONE + archivar
