import { randomBytes } from 'node:crypto';

const CREDENTIAL_HEADER = 'x-admin-credential';
const CREDENTIAL_LENGTH = 32;

export { CREDENTIAL_HEADER };

export function generateCredential(): string {
  return randomBytes(CREDENTIAL_LENGTH).toString('hex');
}

export function validateCredential(
  requestCredential: string | undefined,
  expected: string
): boolean {
  if (!requestCredential || !expected) return false;
  if (requestCredential.length !== expected.length) return false;

  let ok = 0;
  for (let i = 0; i < expected.length; i++) {
    ok |= requestCredential.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return ok === 0;
}

export function extractCredential(
  headers: Record<string, string | string[] | undefined>
): string | undefined {
  const raw = headers[CREDENTIAL_HEADER];
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && raw.length > 0) return raw[0];
  return undefined;
}

export function isLoopbackIp(ip: string | undefined): boolean {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

export function isLoopbackHost(hostHeader: string | string[] | undefined): boolean {
  if (!hostHeader) return false;
  const raw = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  if (!raw) return false;
  const host = raw.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

export function isLoopbackRequest(
  ip: string | undefined,
  hostHeader: string | string[] | undefined
): boolean {
  return isLoopbackIp(ip) || isLoopbackHost(hostHeader);
}

export function isLoopbackHostname(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';
}
