# Astro POC - El Rincón de Ébano

Side-by-side migration POC built in Astro without touching the production build/routing.

## Commands

- `npm install`
- `npm run data:sync`
- `npm run dev`
- `npm run build`
- `npm run preview`

## Preview locally

1. `npm install`
2. `npm run data:sync`
3. `npm run dev`
4. Open `http://localhost:4321`

Sample routes:

- Home: `/`
- Category: `/c/Bebidas/`
- Product: `/p/pid-1027260660/`

## Quality Gates

Before every deployment to `poc.elrincondeebano.com`, run:

- `npm run build`

Manual acceptance checklist:

- Home renders product cards and "Agregar" updates cart badge.
- Cart offcanvas opens and allows `+`, `-`, `Eliminar`, `Vaciar Carrito`, and `Realizar Pedido`.
- WhatsApp order opens with selected payment method in message.
- Category routes `/c/<category>/` filter correctly by key.
- Out-of-stock products are not listed.
- Product detail routes `/p/<sku>/` resolve and render metadata.
- Search, sort, and "Cargar más productos" work on Home and Category.

## Deploy to poc.elrincondeebano.com

This POC deploy is isolated from the production static site workflow.

### Prerequisites

1. Create a Cloudflare Pages project for this POC (for example `elrincondeebano-astro-poc`).
2. In Cloudflare DNS, create `CNAME` record:
   - `poc` -> `<your-pages-project>.pages.dev`
3. Add the custom domain `poc.elrincondeebano.com` to that Pages project.
4. Configure repository secrets/vars used by `.github/workflows/astro-poc-deploy.yml`:
   - Secret: `CF_API_TOKEN`
   - Secret: `CF_ACCOUNT_ID`
   - Variable: `CF_PAGES_PROJECT` (Pages project name)

### Run deployment

1. Go to GitHub Actions.
2. Run workflow: `Astro POC Deploy (Cloudflare Pages)`.
3. Select target environment (default `preview`).

The production workflow for `elrincondeebano.com` remains unchanged.
