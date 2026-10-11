# ADR 0011: Módulo privado de comunicaciones por WhatsApp

- Status: Accepted (2026-10-11, plan 217)
- Scope: admin local (`admin/content-manager/`), sin cambios al storefront público

## Contexto

El operador (una persona) dedica tiempo a redactar promociones para el grupo
de vecinos de Ébano y a responder preguntas repetidas por WhatsApp. Se busca
ahorrar tiempo sin agregar servicios, costos ni riesgo de exponer teléfonos.

## Capacidades verificadas de WhatsApp (2026-10)

| Capacidad                                                                                     | Estado                                                                                                                                                                      | Fuente                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `https://wa.me/<número>?text=<texto>` abre ese chat con texto prellenado                      | Comprobado; el envío lo hace el usuario                                                                                                                                     | [FAQ Click to Chat](https://whatsapp.com/faq/en/general/26000030)                                                                                                                        |
| `https://wa.me/?text=<texto>` (sin número) muestra la lista de chats para elegir destinatario | Comprobado para contactos; **que aparezcan grupos depende del cliente y no está documentado**                                                                               | Misma FAQ                                                                                                                                                                                |
| Adjuntar imágenes vía `wa.me`                                                                 | **No existe**: solo texto                                                                                                                                                   | Misma FAQ                                                                                                                                                                                |
| Enlace `chat.whatsapp.com/…`                                                                  | Solo sirve para **unirse** a un grupo; no publica                                                                                                                           | —                                                                                                                                                                                        |
| Web Share API con archivos (`navigator.share({files})`)                                       | Funciona en Chrome Android / Safari iOS / Chrome Windows-ChromeOS; **no en Chrome Linux escritorio**. Se detecta con `navigator.canShare`, nunca por user agent             | MDN                                                                                                                                                                                      |
| Groups API de la WhatsApp Business Platform                                                   | Requiere Cloud API (no la app Business), estado Official Business Account, grupos de máx. 8 participantes creados por la API. **No aplica** al grupo existente del edificio | Fuentes secundarias ([Kapso](https://kapso.ai/blog/whatsapp-groups-api-state-2026), [Unipile](https://www.unipile.com/whatsapp-group-api/)); no se pudo leer la doc de Meta directamente |

## Alternativas evaluadas

1. **Solo funciones nativas de WhatsApp Business** (respuestas rápidas con `/`,
   etiquetas, mensajes de ausencia y bienvenida). Costo cero y ya se ejecutan
   dentro del chat correcto. Limitaciones: no tienen variables con precio y
   enlace del catálogo, no tienen fotos del catálogo y no detectan repeticiones.
   **Se mantienen como complemento:** las respuestas sin datos variables
   (horarios, medios de pago) conviene cargarlas también como respuestas
   rápidas nativas.
2. **Miniapp propia con traspaso a WhatsApp** (elegida). Reutiliza el catálogo
   real (precios, descuentos, fotos, URL `/p/<sku>/`) y el admin local
   existente (Fastify en loopback, credencial y escritura atómica). El
   operador siempre pulsa Enviar.
3. **API oficial (Cloud API / Groups API)**. Descartada: exige migrar el
   número fuera de la app Business, verificación de negocio, OBA y plantillas
   aprobadas, y no publica en el grupo existente. Su costo y riesgo son
   desproporcionados para una sola persona.

## Decisión

- Se agrega la ruta `/comms` («Mensajes») **dentro del Content Manager**. No
  es una app aparte: así hereda el binding loopback, la allowlist de Host, la
  credencial de mutaciones y el acceso de solo lectura al catálogo.
- Los datos privados (plantillas, destinos con teléfonos, historial) viven en
  `data/.comms/comms.json`. El directorio completo está en `.gitignore`
  (incluye los `.backup_*` del writer atómico) y queda fuera de
  `BACKUP_FILES`, del sync al storefront y del `git add` de publicación, que
  solo agrega rutas explícitas. El archivo tiene modo 0600 y el GET responde
  con `Cache-Control: no-store`.
- API: `GET /api/v1/comms` y `PUT /api/v1/comms`, que reemplaza el documento
  completo con `expected_rev` (concurrencia optimista, responde 409 si cambió).
  El servidor valida con zod y verifica que no haya ids duplicados.
- Las imágenes persistidas solo pueden ser rutas `assets/images/…` del
  catálogo. Las imágenes propias se adjuntan por envío y no se guardan.
- Las imágenes compartidas se convierten a JPEG (y a PNG para el
  portapapeles). WhatsApp puede tratar un `.webp` como sticker.
- Estados honestos en el historial: `preparado`, `chat_abierto`,
  `compartir_iniciado` y `enviado_manual` (este último solo lo marca el
  operador). No hay métricas de entrega ni de lectura.

## Consecuencias

- El MVP es **de escritorio** (WhatsApp Web o Desktop). El admin no es
  accesible desde el teléfono porque rechaza HOST no loopback. Habilitar el
  móvil requiere un acceso autenticado (por ejemplo Tailscale o Cloudflare
  Access) y es una decisión aparte.
- En Chrome Linux no hay Web Share con archivos. El flujo de texto + imagen
  queda así: «Copiar imagen» → «Abrir chat con mensaje» → pegar (Ctrl+V) → Enviar.
- Rollback: quitar la ruta y la entrada de navegación. `data/.comms/` puede
  borrarse o conservarse; no afecta al catálogo ni al storefront.
