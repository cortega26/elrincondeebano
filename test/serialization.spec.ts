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

  // Plan 184: hostile catalog strings must not break out of the inline
  // script data blocks (index/combos experience JSON, JSON-LD). Inside a
  // classic script block only a literal </script matters for breakout;
  // comment and legacy-escape sequences are inert there — pinned here so a
  // future "improvement" to the escaper cannot silently narrow it, and so
  // any change that DOES let a breakout through fails loudly.
  it('neutralizes every script-breakout shape in hostile catalog strings', () => {
    const hostile = {
      breakout: '</script><script>alert(document.domain)</script>',
      upper: '</SCRIPT><SCRIPT>alert(1)</SCRIPT>',
      split: '<\\/script>',
      commentOpen: '<!--',
      commentClose: '-->',
      legacyCombo: '<!--<script>alert(1)</script>-->',
      eventHandler: '<img src=x onerror=alert(1)>',
      separators: 'a b c',
    };
    const result = safeScriptJSON(hostile);
    expect(result.toLowerCase()).not.toContain('</script');
    expect(JSON.parse(result)).toEqual(hostile);
  });
});
