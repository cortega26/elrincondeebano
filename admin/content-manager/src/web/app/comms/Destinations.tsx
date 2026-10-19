import { useState } from 'react';
import { formatPhone, newId, normalizePhone } from '../../../shared/comms.ts';
import type { CommsDestination } from '../../../shared/schemas/comms.ts';

export function Destinations({
  destinations,
  busy,
  onAdd,
  onRemove,
}: {
  destinations: CommsDestination[];
  busy: boolean;
  onAdd: (d: CommsDestination) => void;
  onRemove: (id: string) => void;
}): React.ReactElement {
  const [alias, setAlias] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [isGroup, setIsGroup] = useState(false);
  const normalized = normalizePhone(phone);
  const valid = alias.trim() && (isGroup || normalized);

  return (
    <details className="comms-panel">
      <summary>Destinos ({destinations.length})</summary>
      <ul>
        {destinations.map((d) => (
          <li key={d.id}>
            {d.kind === 'grupo' ? `👥 ${d.alias}` : `${d.alias} · ${formatPhone(d.phone)}`}
            {d.name && ` (${d.name})`}{' '}
            <button
              type="button"
              aria-label={`Eliminar destino ${d.alias}`}
              disabled={busy}
              onClick={() => onRemove(d.id)}
            >
              Eliminar
            </button>
          </li>
        ))}
      </ul>
      <form
        className="comms-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          const id = newId(isGroup ? 'grp' : 'ct');
          onAdd(
            isGroup
              ? { id, kind: 'grupo', alias: alias.trim(), name: name.trim() }
              : { id, kind: 'contacto', alias: alias.trim(), name: name.trim(), phone: normalized! }
          );
          setAlias('');
          setName('');
          setPhone('');
        }}
      >
        <label className="comms-field">
          <span>Alias</span>
          <input
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            placeholder="Depto 1203"
          />
        </label>
        <label className="comms-field">
          <span>Nombre (opcional)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="comms-check">
          <input type="checkbox" checked={isGroup} onChange={(e) => setIsGroup(e.target.checked)} />
          Es un grupo
        </label>
        {!isGroup && (
          <label className="comms-field">
            <span>Número</span>
            <input
              type="tel"
              value={phone}
              aria-invalid={Boolean(phone) && !normalized}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+56 9 1234 5678"
            />
          </label>
        )}
        <button type="submit" disabled={!valid || busy}>
          Agregar destino
        </button>
      </form>
      <p className="comms-hint">
        Los grupos no tienen número: WhatsApp no permite abrir un grupo con texto desde un enlace,
        así que se abre el selector de chats y eliges el grupo ahí. Si tu WhatsApp no lista el
        grupo, usa «Copiar mensaje» y pégalo en el grupo.
      </p>
    </details>
  );
}
