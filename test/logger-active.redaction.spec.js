import { describe, it, expect, vi, afterEach } from 'vitest';
import { log, createCorrelationId, sanitizeLogMeta } from '../astro-poc/src/lib/logger.ts';

describe('active logger redaction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('redacts sensitive keys in log metadata', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});

    log('info', 'test', { authorization: 'Bearer secret123', name: 'test' });

    expect(spy).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(spy.mock.calls[0][0]);
    expect(entry.authorization).toBe('[REDACTED]');
    expect(entry.name).toBe('test');
    expect(entry.message).toBe('test');
    expect(typeof entry.timestamp).toBe('string');
  });

  it('redacts all sensitive key variants', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});

    log('info', 'test', {
      authorization: 'val',
      cookie: 'val',
      token: 'val',
      secret: 'val',
      password: 'val',
      api_key: 'val',
      'api-key': 'val',
      session: 'val',
      credential: 'val',
      safe_field: 'keep',
    });

    const entry = JSON.parse(spy.mock.calls[0][0]);
    expect(entry.authorization).toBe('[REDACTED]');
    expect(entry.cookie).toBe('[REDACTED]');
    expect(entry.token).toBe('[REDACTED]');
    expect(entry.secret).toBe('[REDACTED]');
    expect(entry.password).toBe('[REDACTED]');
    expect(entry.api_key).toBe('[REDACTED]');
    expect(entry['api-key']).toBe('[REDACTED]');
    expect(entry.session).toBe('[REDACTED]');
    expect(entry.credential).toBe('[REDACTED]');
    expect(entry.safe_field).toBe('keep');
  });

  it('truncates long strings beyond 512 characters', () => {
    const longString = 'x'.repeat(600);
    const meta = sanitizeLogMeta({ text: longString });
    expect(meta.text).toBe('x'.repeat(509) + '...');
    expect(meta.text.length).toBe(512);
  });

  it('detects and marks circular references', () => {
    const circular = { name: 'test' };
    circular.self = circular;

    const meta = sanitizeLogMeta({ data: circular });
    expect(meta.data).toEqual({ name: 'test', self: '[Circular]' });
  });

  it('normalizes Error objects', () => {
    const meta = sanitizeLogMeta({ err: new Error('something broke') });
    expect(meta.err).toEqual({ name: 'Error', message: 'something broke' });
  });

  it('handles deeply nested sensitive keys', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});

    log('info', 'deep', {
      user: { session: 'abc123', name: 'test' },
    });

    const entry = JSON.parse(spy.mock.calls[0][0]);
    expect(entry.user.session).toBe('[REDACTED]');
    expect(entry.user.name).toBe('test');
  });

  it('handles arrays with sensitive keys', () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});

    log('info', 'array_test', {
      items: [
        { token: 'abc', id: 1 },
        { token: 'def', id: 2 },
      ],
    });

    const entry = JSON.parse(spy.mock.calls[0][0]);
    expect(entry.items[0].token).toBe('[REDACTED]');
    expect(entry.items[0].id).toBe(1);
    expect(entry.items[1].token).toBe('[REDACTED]');
    expect(entry.items[1].id).toBe(2);
  });

  it('preserves null and undefined values', () => {
    const meta = sanitizeLogMeta({ a: null, b: undefined });
    expect(meta.a).toBeNull();
    expect(meta.b).toBeUndefined();
  });

  it('handles primitive values directly', () => {
    const meta = sanitizeLogMeta({ string: 'hello', number: 42, bool: true });
    expect(meta.string).toBe('hello');
    expect(meta.number).toBe(42);
    expect(meta.bool).toBe(true);
  });
});

describe('createCorrelationId', () => {
  it('returns a non-empty string', () => {
    const id = createCorrelationId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('returns different values on each call', () => {
    const id1 = createCorrelationId();
    const id2 = createCorrelationId();
    expect(id1).not.toBe(id2);
  });
});
