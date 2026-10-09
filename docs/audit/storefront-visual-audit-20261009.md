# Auditoría visual del storefront — 2026-10-09

**Base verificada:** \`cortega26/elrincondeebano\`, \`main@6983dc72915a7a793b34b9642a1609f4da4c106b\`.
Fuentes: storefront público en escritorio, \`AGENTS.md\`, \`astro-poc/src/styles/global.css\`, \`BaseLayout.astro\`, \`Navbar.astro\`, \`CategoryAnchorBar.astro\`, \`CatalogControls.astro\`, \`ProductCard.astro\`, \`CategoryCatalogPage.astro\`, plan previo \`plans/archive/215-storefront-ux-polish/spec.md\` y pruebas E2E existentes.

## Evidencia y hallazgos

1. **Verificado en captura pública, escritorio 1440px:** el campo de búsqueda y botón primario aparecían apilados, aunque había ancho disponible. Causa verificada en CSS: \`.btn-primary { width: 100%; }\` también afectaba al botón del formulario horizontal.
2. **Verificado en captura pública:** cabecera oscuro-saturada, título XXL pesado, barra de chips con bordes redondeados y múltiples tarjetas encajadas. Interpretación estética: son patrones repetitivos más cercanos a un template genérico que a una tienda local.
3. **Verificado en CSS:** pesos 800 en marca, hero, subtítulos y precios; márgenes/radios/sombras independientes entre componentes; gradientes en superficies sticky y carrito.
4. **Verificado:** contratos de JS/cart y tests (IDs, data attrs, controles sticky, botón mobile de pedido) existen y deben conservarse.
5. **Alcance no verificado mediante visión:** contraste píxel a píxel, dispositivos reales de usuario o resultado de conversión. No inferir impacto comercial sin analítica.

## Solución acotada

- Una sola capa de tokens y reglas visuales (\`storefront-refinement.css\`) importada al final, manteniendo Bootstrap y hooks.
- Buscador lado a lado en escritorio y móvil con ancho mínimo protegido, sin selector adicional.
- Colores de menor saturación, marfil tenue, textos legibles, controles con bordes discretos.
- Sustitución del bloque de cápsulas del home por pestañas con subrayado y enfoque accesible; mantiene anclas y scroll.
- Menos cajas anidadas y sombras; producto y precio dominan cada ficha; carrito más sobrio.
- Regresión E2E para geometría de búsqueda, ancho móvil y filtrado+añadido al pedido.
- Validar CI, Lighthouse, Playwright y preview; desplegar solo después de pruebas.

## Fuera de alcance

No se modifica inventario, taxonomía, precios, SEO, analítica, transporte ni lógica de WhatsApp. No se declara incremento de conversión sin datos. Rollback: revertir el merge del PR.

## Segunda inspección visual en producción

- **Verificado con screenshot móvil 390 × 844:** al abrir el menú, el colapso Bootstrap permanecía en la fila flex sin wrap y desplazaba marca/carrito al costado. Se corrige anclando el panel debajo de la cabecera (sin modificar los hooks de Bootstrap).
- **Verificado con screenshot de categoría móvil:** el valor de orden predeterminado estaba cortado y «Solo ofertas» saltaba a dos líneas. Se acortan exclusivamente las etiquetas visuales: «Por defecto» y «Ofertas»; valores, filtrado y etiquetas de accesibilidad se conservan.
- Regresión E2E adicional: geometría del panel, marca/carrito, expansión de Varios, y presencia de la categoría Papelería y Oficina.
