export function safeScriptJSON(value: unknown): string {
  return JSON.stringify(value).replace(/<\//g, '<\\/');
}
