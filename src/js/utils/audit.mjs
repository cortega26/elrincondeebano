import { createCorrelationId } from './logger.mts';

const KEY = 'audit_log';
const MAX_EVENTS = 100;

function readAll() {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    return Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writeAll(events) {
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(events)); } catch { }
}

export function record(event, details = {}) {
  const entry = { id: createCorrelationId(), ts: new Date().toISOString(), event, details };
  const all = readAll();
  all.push(entry);
  while (all.length > MAX_EVENTS) all.shift();
  writeAll(all);
  return entry;
}

export function list() { return readAll(); }
export function clear() { writeAll([]); }
export function exportJson(autoDownload = true) {
  const data = JSON.stringify(readAll(), null, 2);
  if (!autoDownload) return data;
  try {
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'audit-log.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch { }
  return data;
}

