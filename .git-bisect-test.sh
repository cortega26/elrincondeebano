#!/usr/bin/env bash
set -euo pipefail

npm ci --silent
npm run build --silent

npx serve -l 4173 dist >/dev/null 2>&1 &
SERVE_PID=$!
sleep 1

npx cypress run --spec "cypress/e2e/nav_menu.cy.ts" >/dev/null 2>&1
STATUS=$?

kill $SERVE_PID || true

exit $STATUS
