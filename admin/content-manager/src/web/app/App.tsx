import { createBrowserRouter, RouterProvider } from 'react-router-dom';
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
import { RouteErrorPage } from './RouteErrorPage.tsx';
import { CredentialPrompt } from './CredentialPrompt.tsx';

const router = createBrowserRouter([
  {
    path: '/',
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
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
]);

export function App(): React.ReactElement {
  return (
    <>
      <RouterProvider router={router} />
      <CredentialPrompt />
    </>
  );
}
