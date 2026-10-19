import type { CommsTemplate } from '../../../shared/schemas/comms.ts';

export function ArchivedTemplates({
  templates,
  onRestore,
}: {
  templates: CommsTemplate[];
  onRestore: (id: string) => void;
}): React.ReactElement | null {
  if (templates.length === 0) return null;
  return (
    <details className="comms-panel">
      <summary>Archivadas ({templates.length})</summary>
      <ul>
        {templates.map((t) => (
          <li key={t.id}>
            {t.title}{' '}
            <button type="button" onClick={() => onRestore(t.id)}>
              Restaurar
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
