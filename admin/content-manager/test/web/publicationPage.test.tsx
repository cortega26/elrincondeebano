// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { renderWithRouter, mockApi } from './harness.tsx';
import { PublicationPage } from '@web/app/routes/PublicationPage.tsx';

beforeEach(() => {
  vi.clearAllMocks();
  mockApi.getGitStatus.mockResolvedValue({
    branch: 'main',
    dirty: false,
    staged: [],
    unstaged: [],
    untracked: [],
    ahead: 0,
    behind: 0,
    hasConflicts: false,
  } as unknown as Awaited<ReturnType<typeof mockApi.getGitStatus>>);
  mockApi.getJob.mockResolvedValue({
    id: 'job-1',
    type: 'publication',
    status: 'completed',
    progress: 100,
  } as unknown as Awaited<ReturnType<typeof mockApi.getJob>>);
  mockApi.listJobs.mockResolvedValue({ jobs: [] } as unknown as Awaited<
    ReturnType<typeof mockApi.listJobs>
  >);
  mockApi.previewPublication.mockResolvedValue({
    preflight: { ok: true, checks: [], errors: [], warnings: [] },
    git: {
      branch: 'main',
      dirty: false,
      staged: [],
      unstaged: [],
      untracked: [],
      ahead: 0,
      behind: 0,
      hasConflicts: false,
    },
  } as unknown as Awaited<ReturnType<typeof mockApi.previewPublication>>);
  mockApi.publish.mockResolvedValue({ job_id: 'job-1', status: 'scheduled' } as unknown as Awaited<
    ReturnType<typeof mockApi.publish>
  >);
  mockApi.cancelJob.mockResolvedValue({
    id: 'job-1',
    type: 'publication',
    status: 'cancelled',
    progress: 0,
  } as unknown as Awaited<ReturnType<typeof mockApi.cancelJob>>);
});

describe('PublicationPage (component)', () => {
  test('renders datetime-local input and notice about admin must be running', async () => {
    renderWithRouter(<PublicationPage />);
    expect(screen.getByLabelText('Fecha programada')).toBeInTheDocument();
    expect(screen.getByLabelText('Fecha programada')).toHaveAttribute('type', 'datetime-local');
    expect(
      screen.getByText(/el admin debe estar corriendo a la hora programada/i)
    ).toBeInTheDocument();
  });

  test('datetime input empty means immediate — submit sends publish without publishAt', async () => {
    const user = userEvent.setup();
    renderWithRouter(<PublicationPage />);

    const input = screen.getByLabelText('Fecha programada') as HTMLInputElement;
    expect(input.value).toBe('');

    await user.click(screen.getByRole('button', { name: 'Commit' }));

    await waitFor(() => {
      expect(mockApi.publish).toHaveBeenCalled();
    });
    const args = mockApi.publish.mock.calls[0] as unknown[];
    // publish(commitMessage, push, publishAt?) — third arg undefined when empty
    expect(args[2]).toBeUndefined();
  });

  test('datetime input filled sends publishAt ISO string', async () => {
    const user = userEvent.setup();
    renderWithRouter(<PublicationPage />);

    const input = screen.getByLabelText('Fecha programada');
    // datetime-local value format: YYYY-MM-DDTHH:mm
    await user.type(input, '2026-09-01T10:00');

    await user.click(screen.getByRole('button', { name: 'Commit' }));

    await waitFor(() => {
      expect(mockApi.publish).toHaveBeenCalled();
    });
    const args = mockApi.publish.mock.calls[0] as unknown[];
    expect(typeof args[2]).toBe('string');
    // The ISO string should be a valid date and correspond to the local input
    expect(new Date(args[2] as string).toISOString()).toBe(args[2]);
  });

  test('pending jobs section lists pending jobs with working Cancel for pending', async () => {
    const user = userEvent.setup();
    mockApi.listJobs.mockResolvedValue({
      jobs: [
        {
          id: 'job-pending-1',
          type: 'publication',
          status: 'pending',
          progress: 0,
          scheduled_at: new Date(Date.now() + 60_000).toISOString(),
        },
      ],
    } as unknown as Awaited<ReturnType<typeof mockApi.listJobs>>);

    renderWithRouter(<PublicationPage />);

    await waitFor(() => {
      expect(screen.getByText(/job-pending-1/)).toBeInTheDocument();
    });
    // "pending" appears both in the job id and the status — check at least one exact status node
    expect(screen.getAllByText(/pending/).length).toBeGreaterThanOrEqual(1);

    const cancelBtn = screen.getByRole('button', { name: 'Cancelar job-pending-1' });
    expect(cancelBtn).toBeInTheDocument();

    await user.click(cancelBtn);

    await waitFor(() => {
      expect(mockApi.cancelJob).toHaveBeenCalledWith('job-pending-1');
    });
  });

  test('Cancel button visible for pending job in main Job section (extend running-only)', async () => {
    // Simulate a job that was just scheduled and is pending
    mockApi.publish.mockResolvedValue({
      job_id: 'job-pend',
      status: 'scheduled',
    } as unknown as Awaited<ReturnType<typeof mockApi.publish>>);
    // Avoid polling finishing — keep job pending
    mockApi.getJob.mockResolvedValue({
      id: 'job-pend',
      type: 'publication',
      status: 'pending',
      progress: 0,
      scheduled_at: new Date(Date.now() + 60_000).toISOString(),
    } as unknown as Awaited<ReturnType<typeof mockApi.getJob>>);
    const user = userEvent.setup();
    renderWithRouter(<PublicationPage />);

    await user.click(screen.getByRole('button', { name: 'Commit' }));

    await waitFor(() => {
      expect(screen.getByText(/Job: job-pend/)).toBeInTheDocument();
    });

    // Cancel should be visible for pending as well (plan 162)
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });
});

describe('PublicationPage preview block (plan 211)', () => {
  test('trigger calls the preview endpoint and disables while running', async () => {
    mockApi.triggerPreviewBuild.mockResolvedValue({ job_id: 'pv-1', status: 'running' });
    const user = userEvent.setup();
    renderWithRouter(<PublicationPage />);

    const button = screen.getByRole('button', { name: 'Build + abrir vista previa' });
    await user.click(button);

    await waitFor(() => {
      expect(mockApi.triggerPreviewBuild).toHaveBeenCalled();
    });
    expect(screen.getByRole('button', { name: 'Reconstruyendo…' })).toBeDisabled();
    expect(screen.getByLabelText('Build en curso')).toBeInTheDocument();
  });

  test('completed preview shows open link and evidence download', async () => {
    mockApi.triggerPreviewBuild.mockResolvedValue({ job_id: 'pv-2', status: 'completed' });
    const user = userEvent.setup();
    renderWithRouter(<PublicationPage />);

    await user.click(screen.getByRole('button', { name: 'Build + abrir vista previa' }));

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Abrir vista previa →' })).toHaveAttribute(
        'href',
        '/api/v1/preview/'
      );
    });
    expect(screen.getByRole('button', { name: 'Descargar evidencia' })).toBeInTheDocument();
  });

  test('a live build-preview job from the server disables the trigger', async () => {
    mockApi.listJobs.mockResolvedValue({
      jobs: [{ id: 'pv-live', type: 'build-preview', status: 'running', progress: 40 }],
    });
    renderWithRouter(<PublicationPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Reconstruyendo…' })).toBeDisabled();
    });
  });
});
