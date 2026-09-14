// @vitest-environment jsdom
// Plan 013 Step 1: paste-path cap + file-picker cap share MAX_IMPORT_BYTES.
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter, mockApi } from './harness.tsx';
import { ImportPage } from '@web/app/routes/ImportPage.tsx';
import { MAX_IMPORT_BYTES } from '@shared/schemas/importExport.ts';

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.importPreview.mockResolvedValue({
    preview_id: 'import-test',
    input_hash: 'abc',
    base_rev: 0,
    summary: { additions: 0, updates: 0, unchanged: 0, invalid: 0, conflicts: 0 },
    additions: [],
    updates: [],
    conflicts: [],
    validation_errors: [],
  } as unknown as Awaited<ReturnType<typeof mockApi.importPreview>>);
});

describe('ImportPage size caps (plan 013)', () => {
  test('oversize file is rejected with the limit message and never previews', async () => {
    const user = userEvent.setup();
    renderWithRouter(<ImportPage />);

    const fileInput = document.getElementById('import-file') as HTMLInputElement;
    const file = new File(['{}'], 'big.json', { type: 'application/json' });
    Object.defineProperty(file, 'size', { value: MAX_IMPORT_BYTES + 1 });
    await user.upload(fileInput, file);

    expect(screen.getByRole('alert')).toHaveTextContent(/supera el límite de 5 MB/);
    expect(mockApi.importPreview).not.toHaveBeenCalled();
  });

  test('oversize paste is rejected before parsing with the same limit', async () => {
    const user = userEvent.setup();
    renderWithRouter(<ImportPage />);

    const textarea = screen.getByLabelText('Pegar catálogo JSON') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'x'.repeat(MAX_IMPORT_BYTES + 1) } });

    await user.click(screen.getByRole('button', { name: 'Vista previa' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/supera el límite de 5 MB/);
    });
    expect(mockApi.importPreview).not.toHaveBeenCalled();
  });

  test('payload at the real-catalog scale passes the client cap', async () => {
    const user = userEvent.setup();
    renderWithRouter(<ImportPage />);

    const payload = JSON.stringify({ products: [{ name: 'Ok', price: 100 }] });
    expect(new TextEncoder().encode(payload).length).toBeLessThan(MAX_IMPORT_BYTES);

    const textarea = screen.getByLabelText('Pegar catálogo JSON') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: payload } });
    await user.click(screen.getByRole('button', { name: 'Vista previa' }));

    await waitFor(() => {
      expect(mockApi.importPreview).toHaveBeenCalledTimes(1);
    });
  });
});
