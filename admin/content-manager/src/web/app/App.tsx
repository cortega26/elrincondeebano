import {
  createBrowserRouter,
  RouterProvider,
  useNavigate,
  Outlet,
  NavLink,
} from 'react-router-dom';
import { useEffect } from 'react';
import { RecoveryBanner } from './components/RecoveryBanner.tsx';
import { ProductsPage } from './routes/ProductsPage.tsx';
import { CategoriesPage } from './routes/CategoriesPage.tsx';
import { MediaPage } from './routes/MediaPage.tsx';
import { HistoryPage } from './routes/HistoryPage.tsx';
import { BundlesPage } from './routes/BundlesPage.tsx';
import { ImportPage } from './routes/ImportPage.tsx';
import { ConflictsPage } from './routes/ConflictsPage.tsx';
import { NotFoundPage } from './routes/NotFoundPage.tsx';
import { PublicationPage } from './routes/PublicationPage.tsx';
import { DiagnosticsPage } from './routes/DiagnosticsPage.tsx';
import { SettingsPage } from './routes/SettingsPage.tsx';
import { HelpPage } from './routes/HelpPage.tsx';
import { RouteErrorPage } from './RouteErrorPage.tsx';
import { CredentialPrompt } from './CredentialPrompt.tsx';
import { loadPreferences, applyPreferences } from './preferences.ts';

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
      {
        path: 'categories',
        element: <CategoriesPage />,
      },
      {
        path: 'media',
        element: <MediaPage />,
      },
      {
        path: 'history',
        element: <HistoryPage />,
      },
      {
        path: 'bundles',
        element: <BundlesPage />,
      },
      {
        path: 'import',
        element: <ImportPage />,
      },
      {
        path: 'conflicts',
        element: <ConflictsPage />,
      },
      {
        path: 'publish',
        element: <PublicationPage />,
      },
      {
        path: 'diagnostics',
        element: <DiagnosticsPage />,
      },
      {
        path: 'settings',
        element: <SettingsPage />,
      },
      {
        path: 'help',
        element: <HelpPage />,
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
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
