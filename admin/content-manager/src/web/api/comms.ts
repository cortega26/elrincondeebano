// Plan 217: slice de comunicaciones del ContentManagerClient (sobre el core
// único de requestCore.ts — sin fetch propio).
import type { CommsDocument } from '../../shared/schemas/comms.ts';
import type { ApiRequestFn } from './requestCore.ts';

export async function getComms(request: ApiRequestFn): Promise<CommsDocument> {
  return request<CommsDocument>('/comms', { cache: 'no-store' });
}

export async function saveComms(
  request: ApiRequestFn,
  document: CommsDocument,
  expectedRev: number
): Promise<CommsDocument> {
  return request<CommsDocument>('/comms', {
    method: 'PUT',
    body: JSON.stringify({ expected_rev: expectedRev, document }),
  });
}
