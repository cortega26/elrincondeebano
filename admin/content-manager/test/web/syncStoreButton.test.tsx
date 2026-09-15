// @vitest-environment jsdom
// One-click store sync button: status display, confirm gate, publish+push
// call shape, job polling, and failure surfacing.

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter, mockApi } from './harness.tsx';
import { SyncStoreButton } from '@web/app/components/SyncStoreButton.tsx';

function gitStatus(overrides: Record<string, unknown> = {}) {
  return {
    branch: 'main',
    dirty: true,
    staged: ['data/product_data.json'],
    unstaged: [],
    untracked: [],
    ahead: 0,
    behind: 0,
    hasConflicts: false,
    ...overrides,
  };
}

function renderButton() {
  const setFeedback = vi.fn();
  const setOpError = vi.fn();
  renderWithRouter(<SyncStoreButton setFeedback={setFeedback} setOpError={setOpError} />);
  return { setFeedback, setOpError };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('SyncStoreButton', () => {
  test('shows the dirty count and publishes with push on confirm', async () => {
    mockApi.getGitStatus.mockResolvedValue(gitStatus({ staged: ['a', 'b'] }));
    mockApi.publish.mockResolvedValue({ job_id: 'job-1', status: 'scheduled' });
    mockApi.getJob.mockResolvedValue({
      id: 'job-1',
      type: 'publication',
      status: 'completed',
      progress: 100,
      result: { commit: 'abc1234def', pushed: true },
    });
    const user = userEvent.setup();
    const { setFeedback } = renderButton();

    const button = await screen.findByRole('button', { name: /sincronizar tienda/i });
    expect(button).toHaveTextContent('(2)');

    await user.click(button);
    expect(window.confirm).toHaveBeenCalled();
    expect(mockApi.publish).toHaveBeenCalledWith(undefined, true);

    await waitFor(() => {
      expect(setFeedback).toHaveBeenCalledWith(
        expect.stringMatching(/sincronizada.*abc1234.*push/i)
      );
    });
  });

  test('clean tree reports up-to-date without publishing', async () => {
    mockApi.getGitStatus.mockResolvedValue(gitStatus({ dirty: false, staged: [] }));
    const user = userEvent.setup();
    const { setFeedback } = renderButton();

    // Note: the aria-label fixes the accessible name, so assert the
    // visible text separately.
    const button = await screen.findByRole('button', {
      name: 'Sincronizar tienda: validar, commit y push',
    });
    expect(button).toHaveTextContent(/tienda al d/i);
    await user.click(button);

    expect(mockApi.publish).not.toHaveBeenCalled();
    expect(setFeedback).toHaveBeenCalledWith(expect.stringMatching(/al d/i));
  });

  test('cancelled confirm never publishes', async () => {
    mockApi.getGitStatus.mockResolvedValue(gitStatus());
    vi.mocked(window.confirm).mockReturnValue(false);
    const user = userEvent.setup();
    renderButton();

    const button = await screen.findByRole('button', { name: /sincronizar tienda/i });
    await user.click(button);

    expect(mockApi.publish).not.toHaveBeenCalled();
  });

  test('conflicted tree surfaces an error without publishing', async () => {
    mockApi.getGitStatus.mockResolvedValue(gitStatus({ hasConflicts: true }));
    const user = userEvent.setup();
    const { setOpError } = renderButton();

    const button = await screen.findByRole('button', { name: /sincronizar tienda/i });
    await user.click(button);

    expect(mockApi.publish).not.toHaveBeenCalled();
    expect(setOpError).toHaveBeenCalledWith(expect.stringMatching(/conflicto/i));
  });

  test('failed job surfaces the server error', async () => {
    mockApi.getGitStatus.mockResolvedValue(gitStatus());
    mockApi.publish.mockResolvedValue({ job_id: 'job-9', status: 'scheduled' });
    mockApi.getJob.mockResolvedValue({
      id: 'job-9',
      type: 'publication',
      status: 'failed',
      progress: 30,
      error: 'Preflight failed: validación',
    });
    const user = userEvent.setup();
    const { setOpError } = renderButton();

    const button = await screen.findByRole('button', { name: /sincronizar tienda/i });
    await user.click(button);

    await waitFor(() => {
      expect(setOpError).toHaveBeenCalledWith(expect.stringMatching(/preflight/i));
    });
  });

  test('publish rejection surfaces inline', async () => {
    mockApi.getGitStatus.mockResolvedValue(gitStatus());
    mockApi.publish.mockRejectedValue(new Error('Push failed (commit: abc)'));
    const user = userEvent.setup();
    const { setOpError } = renderButton();

    const button = await screen.findByRole('button', { name: /sincronizar tienda/i });
    await user.click(button);

    await waitFor(() => {
      expect(setOpError).toHaveBeenCalledWith(expect.stringMatching(/push failed/i));
    });
  });
});
