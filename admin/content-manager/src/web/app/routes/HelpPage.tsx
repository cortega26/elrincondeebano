import { Link } from 'react-router-dom';

const SHORTCUTS: Array<{ keys: string; action: string }> = [
  { keys: 'g p', action: 'Ir a Productos' },
  { keys: 'g c', action: 'Ir a Categorías' },
  { keys: 'g m', action: 'Ir a Medios' },
  { keys: 'g i', action: 'Ir a Importar' },
  { keys: 'g u', action: 'Ir a Publicación' },
  { keys: 'g d', action: 'Ir a Diagnóstico' },
  { keys: 'g s', action: 'Ir a Preferencias' },
  { keys: '?', action: 'Abrir esta ayuda' },
];

const TASKS: Array<{ task: string; steps: string[] }> = [
  {
    task: 'Explorar y filtrar el catálogo',
    steps: [
      'En Productos, usa la búsqueda, precio min/max, categoría y estado.',
      'Los filtros viven en la URL: se restauran al recargar.',
    ],
  },
  {
    task: 'Crear o duplicar un producto',
    steps: [
      'Botón "+ Nuevo" o "Dup." en la fila de un producto.',
      'El duplicado crea una identidad nueva (id, revisión y metadata propias).',
    ],
  },
  {
    task: 'Revisar y aplicar una importación',
    steps: [
      'Sube el JSON del catálogo (o pégalo) y presiona "Vista previa".',
      'Resuelve cada conflicto y confirma la aplicación en el diálogo de aprobación.',
    ],
  },
  {
    task: 'Recuperar tras un error de escritura',
    steps: [
      'Revisa Diagnóstico: el informe indica qué chequeos fallaron y cómo remediarlos.',
      'Para conflictos de rebase de Git: `git rebase --abort` en el repo.',
    ],
  },
  {
    task: 'Publicar el catálogo',
    steps: [
      'En Publicación, revisa el estado de Git y usa "Git pull (rebase)" si el remoto avanzó.',
      'Solo publica con el árbol limpio y tras la vista previa.',
    ],
  },
];

export function HelpPage(): React.ReactElement {
  return (
    <main role="main" aria-label="Ayuda">
      <nav
        aria-label="Navegación principal"
        style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}
      >
        <Link to="/products">Productos</Link>
        <Link to="/publish">Publicación</Link>
        <Link to="/help" aria-current="page">
          Ayuda
        </Link>
      </nav>

      <h1>Ayuda y atajos de teclado</h1>

      <section aria-label="Atajos de teclado" style={{ marginBottom: '1.5rem' }}>
        <h2>Atajos de teclado</h2>
        <table
          aria-label="Atajos de teclado"
          style={{ width: '100%', borderCollapse: 'collapse', maxWidth: '480px' }}
        >
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Teclas</th>
              <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.keys} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '0.25rem 0.5rem' }}>
                  <kbd>{s.keys}</kbd>
                </td>
                <td style={{ padding: '0.25rem 0.5rem' }}>{s.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: '0.85rem', color: '#6c757d' }}>
          Los atajos solo navegan: ninguna acción destructiva está ligada a teclas.
        </p>
      </section>

      <section aria-label="Guías por tarea">
        <h2>Guías por tarea</h2>
        {TASKS.map((t) => (
          <article key={t.task} style={{ marginBottom: '1rem' }}>
            <h3>{t.task}</h3>
            <ul>
              {t.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>
    </main>
  );
}
