import {
  createBrowserRouter,
  RouterProvider,
  useNavigate,
  Outlet,
  NavLink,
} from 'react-router-dom';
import { lazy, Suspense, useEffect } from 'react';
import { RecoveryBanner } from './components/RecoveryBanner.tsx';
import { ProductsPage } from './routes/ProductsPage.tsx';
import { RouteErrorPage } from './RouteErrorPage.tsx';
import { CredentialPrompt } from './CredentialPrompt.tsx';
import { loadPreferences, applyPreferences } from './preferences.ts';

// Plan 241: solo ProductsPage viaja en el chunk inicial (index + /products);
// el resto de las rutas se descargan por demanda (React.lazy + Suspense).
const CategoriesPage = lazy(() =>
  import('./routes/CategoriesPage.tsx').then((m) => ({ default: m.CategoriesPage }))
);
const MediaPage = lazy(() =>
  import('./routes/MediaPage.tsx').then((m) => ({ default: m.MediaPage }))
);
const HistoryPage = lazy(() =>
  import('./routes/HistoryPage.tsx').then((m) => ({ default: m.HistoryPage }))
);
const BundlesPage = lazy(() =>
  import('./routes/BundlesPage.tsx').then((m) => ({ default: m.BundlesPage }))
);
const ImportPage = lazy(() =>
  import('./routes/ImportPage.tsx').then((m) => ({ default: m.ImportPage }))
);
const ConflictsPage = lazy(() =>
  import('./routes/ConflictsPage.tsx').then((m) => ({ default: m.ConflictsPage }))
);
const NotFoundPage = lazy(() =>
  import('./routes/NotFoundPage.tsx').then((m) => ({ default: m.NotFoundPage }))
);
const PublicationPage = lazy(() =>
  import('./routes/PublicationPage.tsx').then((m) => ({ default: m.PublicationPage }))
);
const DiagnosticsPage = lazy(() =>
  import('./routes/DiagnosticsPage.tsx').then((m) => ({ default: m.DiagnosticsPage }))
);
const SettingsPage = lazy(() =>
  import('./routes/SettingsPage.tsx').then((m) => ({ default: m.SettingsPage }))
);
const HelpPage = lazy(() => import('./routes/HelpPage.tsx').then((m) => ({ default: m.HelpPage })));
const CommsPage = lazy(() =>
  import('./routes/CommsPage.tsx').then((m) => ({ default: m.CommsPage }))
);

// Plan 241: aviso mínimo y accesible mientras se descarga el chunk de la
// ruta; se muestra dentro del Layout, así la navegación sigue disponible.
function RoutePending(): React.ReactElement {
  return (
    <div className="route-loading" role="status">
      Cargando…
    </div>
  );
}

function routePage(page: React.ReactElement): React.ReactElement {
  return <Suspense fallback={<RoutePending />}>{page}</Suspense>;
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    errorElement: <RouteErrorPage />,
    children: [
      {
        index: true,
        element: <ProductsPage />,
      },
      {
        path: 'products',
        element: <ProductsPage />,
      },
      { path: 'categories', element: routePage(<CategoriesPage />) },
      { path: 'media', element: routePage(<MediaPage />) },
      { path: 'history', element: routePage(<HistoryPage />) },
      { path: 'bundles', element: routePage(<BundlesPage />) },
      { path: 'import', element: routePage(<ImportPage />) },
      { path: 'conflicts', element: routePage(<ConflictsPage />) },
      { path: 'publish', element: routePage(<PublicationPage />) },
      { path: 'diagnostics', element: routePage(<DiagnosticsPage />) },
      { path: 'settings', element: routePage(<SettingsPage />) },
      { path: 'comms', element: routePage(<CommsPage />) },
      { path: 'help', element: routePage(<HelpPage />) },
      { path: '*', element: routePage(<NotFoundPage />) },
    ],
  },
]);

// Navigation-only shortcuts (plan 061 step 4): 'g' then a key, or '?' for
// help. No destructive action is bound to a key.
const GOTO_MAP: Record<string, string> = {
  p: '/products',
  c: '/categories',
  m: '/media',
  h: '/history',
  b: '/bundles',
  i: '/import',
  f: '/conflicts',
  u: '/publish',
  d: '/diagnostics',
  s: '/settings',
  w: '/comms',
  '?': '/help',
};

// Plan 093: one persistent top navigation — previously every page shipped
// its own partial nav subset (ProductsPage had none).
const NAV_ITEMS: Array<{ to: string; label: string }> = [
  { to: '/products', label: 'Productos' },
  { to: '/categories', label: 'Categorías' },
  { to: '/bundles', label: 'Vitrina' },
  { to: '/media', label: 'Medios' },
  { to: '/import', label: 'Importar' },
  { to: '/conflicts', label: 'Conflictos' },
  { to: '/history', label: 'Cambios y recuperación' },
  { to: '/publish', label: 'Publicación' },
  { to: '/comms', label: 'Mensajes' },
  { to: '/diagnostics', label: 'Diagnósticos' },
  { to: '/settings', label: 'Ajustes' },
  { to: '/help', label: 'Ayuda' },
];

function ShortcutLayer(): null {
  const navigate = useNavigate();
  useEffect(() => {
    let gPressed = false;
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;
      if (typing) {
        gPressed = false;
        return;
      }

      if (event.key === '?') {
        navigate('/help');
        return;
      }
      // Plan 097: CRUD shortcuts (guarded against typing contexts above).
      if (event.ctrlKey && !event.altKey && !event.metaKey) {
        switch (event.key.toLowerCase()) {
          case 'n':
            event.preventDefault();
            navigate('/products?new=1');
            return;
          case 'e':
            event.preventDefault();
            window.dispatchEvent(new CustomEvent('cm-edit-selected'));
            return;
          case 'd':
            event.preventDefault();
            window.dispatchEvent(new CustomEvent('cm-duplicate-selected'));
            return;
          case 'f':
            event.preventDefault();
            window.dispatchEvent(new CustomEvent('cm-focus-search'));
            return;
          case 'p':
            if (event.shiftKey) {
              event.preventDefault();
              navigate('/publish');
              return;
            }
            break;
          case 'c':
            if (event.shiftKey) {
              event.preventDefault();
              navigate('/publish?commit=1');
              return;
            }
            break;
        }
      }
      if (event.key === 'Delete' || event.key === 'Del') {
        // Archive the selected product (never purge via a key).
        window.dispatchEvent(new CustomEvent('cm-archive-selected'));
        return;
      }
      if (event.key.toLowerCase() === 'g') {
        gPressed = true;
        return;
      }
      if (gPressed && event.key.toLowerCase() in GOTO_MAP) {
        navigate(GOTO_MAP[event.key.toLowerCase()]);
        gPressed = false;
        return;
      }
      gPressed = false;
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate]);
  return null;
}

function Layout(): React.ReactElement {
  return (
    <>
      <RecoveryBanner />
      <ShortcutLayer />
      <nav aria-label="Navegación principal">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/products'}>
            {({ isActive }) => (
              <span aria-current={isActive ? 'page' : undefined}>{item.label}</span>
            )}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  );
}

export function App(): React.ReactElement {
  useEffect(() => {
    applyPreferences(loadPreferences());
  }, []);

  return (
    <>
      <RouterProvider router={router} />
      <CredentialPrompt />
    </>
  );
}
