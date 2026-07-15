import { describe, it, expect } from 'vitest';
import { safeScriptJSON } from '../astro-poc/src/lib/serialization';

describe('safeScriptJSON', () => {
  it('escapes closing script tag', () => {
    const input = { name: 'test</script><script>alert(1)' };
    const result = safeScriptJSON(input);
    expect(result).not.toContain('</script>');
    expect(result).toContain('<\\/script>');
  });

  it('handles normal JSON unchanged', () => {
    const input = { a: 1, b: 'hello' };
    const result = safeScriptJSON(input);
    expect(JSON.parse(result)).toEqual(input);
  });

  it('handles nested objects with closing tags', () => {
    const input = { items: [{ name: 'x</p>' }, { name: 'y</div>' }] };
    const result = safeScriptJSON(input);
    expect(result).not.toContain('</p>');
    expect(result).not.toContain('</div>');
    expect(result).toContain('<\\/p>');
    expect(result).toContain('<\\/div>');
  });

  it('handles empty and primitive values', () => {
    expect(safeScriptJSON(null)).toBe('null');
    expect(safeScriptJSON('hello')).toBe('"hello"');
    expect(safeScriptJSON(42)).toBe('42');
  });
});
