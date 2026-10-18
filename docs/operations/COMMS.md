# Mensajes de WhatsApp (módulo privado del admin)

Decisión y límites: [ADR 0011](../adr/0011-private-whatsapp-comms-module.md) · Plan 217.

## Arranque

```bash
npm run admin:build        # una vez, o tras actualizar
ADMIN_MODE=operator npm run admin:start
# abrir http://127.0.0.1:3000/comms  (atajo: g, w)
```

Guardar plantillas o destinos requiere el modo `operator`. En loopback no
se pide credencial; en modo remoto (`ADMIN_REMOTE_ORIGIN`) toda petición
requiere `x-admin-credential`.

## Uso

**Responder a un vecino** (meta: 3 interacciones con contacto ya guardado):

1. Pestaña «Responder a vecino», escribe parte del tema (`/` enfoca el
   buscador) y pulsa **Enter**: se elige la primera coincidencia.
2. Elige el **Destino**, o «Pegar un número…» para un número nuevo; ese número
   no se guarda.
3. Pulsa **Abrir chat con mensaje** y luego **Enviar** dentro de WhatsApp.

Medido en E2E: buscar + Enter, elegir destino, abrir chat. Son 3 acciones,
más el Enviar obligatorio de WhatsApp. `{nombre}` se completa con el nombre
del contacto guardado.

**Promoción al grupo**:

1. Pestaña «Mensaje nuevo», plantilla «Promoción de producto».
2. Busca el producto del catálogo. El precio, la oferta, el enlace y la foto
   salen del catálogo real. Marca «Revisé que hay stock real»: es
   obligatorio, porque el stock del catálogo se edita a mano.
3. Destino: el grupo. Para el texto con imagen:
   - **Escritorio**: «Copiar imagen» → «Abrir WhatsApp y elegir el grupo» →
     elige el grupo → pega la imagen (Ctrl+V) → Enviar.
   - **Si el navegador admite compartir archivos**: «Compartir texto +
     imagen» → WhatsApp → grupo → Enviar.
   - Si el grupo no aparece en el selector: «Copiar mensaje» y pégalo en el
     grupo.
4. Después de enviar, pulsa «Sí, marcar como enviado». Solo así queda
   registrado como enviado.

Si el mismo texto ya fue al mismo destino en los últimos 7 días, el envío se
bloquea hasta que lo confirmes.

## Qué NO hace (límites reales)

- No envía nada: WhatsApp siempre exige pulsar Enviar.
- No adjunta imágenes por enlace. `wa.me` solo lleva texto.
- No publica en el grupo por API (la Groups API no aplica; ver ADR).
- No sabe quién te escribió: el destinatario siempre lo eliges tú.
- Por defecto no funciona desde el teléfono: el admin escucha en 127.0.0.1.
  Con el despliegue remoto (`ADMIN_REMOTE_ORIGIN` detrás de Cloudflare
  Access, credencial en cada petición) sí; ver
  [ADR 0011](../adr/0011-private-whatsapp-comms-module.md).

## Datos, respaldo y privacidad

- Archivo: `data/.comms/comms.json` (gitignored, modo 0600). Guarda las
  últimas 10 versiones como `comms.json.backup_*` en la misma carpeta.
- **Exportar respaldo** (panel «Respaldo») descarga un JSON versionado
  (`format: rincon-comms-backup`). Incluye teléfonos: guárdalo fuera del repo.
- **Importar** valida el formato y los ids, y pide confirmación antes de
  reemplazar todo.
- Recuperar una versión anterior manualmente: detén el admin y copia el
  `comms.json.backup_<fecha>` deseado sobre `comms.json`.

## Rollback

Revertir el commit del plan 217. `data/.comms/` no afecta al catálogo ni al
storefront; puedes conservarlo o borrarlo.
