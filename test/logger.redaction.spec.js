import { describe, it, expect, vi, afterEach } from 'vitest';
import { log } from '../src/js/utils/logger.mts';

describe('logger redaction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redacts sensitive keys recursively', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});

    log('info', 'security_event', {
      token: 'plain-token',
      nested: {
        Authorization: 'Bearer abc',
        safe: 'ok',
      },
      list: [{ password: 'secret-pass', keep: 1 }],
      cookie: 'id=123',
      keep: 'value',
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(spy.mock.calls[0][0]);
    expect(payload.token).toBe('[REDACTED]');
    expect(payload.nested.Authorization).toBe('[REDACTED]');
    expect(payload.list[0].password).toBe('[REDACTED]');
    expect(payload.cookie).toBe('[REDACTED]');
    expect(payload.keep).toBe('value');
    expect(payload.message).toBe('security_event');
    expect(typeof payload.timestamp).toBe('string');
  });
});
