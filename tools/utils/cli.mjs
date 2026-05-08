import fs from 'node:fs';
import path from 'node:path';

function buildIntegerExpectation(minimum) {
  if (minimum === 0) {
    return 'an integer greater than or equal to 0';
  }
  if (minimum === 1) {
    return 'a positive integer';
  }
  return `an integer greater than or equal to ${minimum}`;
}

export function parseOptionalIntegerOption(rawValue, { name, defaultValue, minimum = 0 }) {
  if (rawValue === undefined || rawValue === null) {
    return defaultValue;
  }

  const normalized = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue).trim();
  if (!/^-?\d+$/.test(normalized)) {
    throw new Error(
      `Invalid ${name}: expected ${buildIntegerExpectation(minimum)}. Received "${rawValue}".`
    );
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(
      `Invalid ${name}: expected ${buildIntegerExpectation(minimum)}. Received "${rawValue}".`
    );
  }

  return parsed;
}

export function writeJsonReport(reportPath, payload) {
  if (!reportPath) {
    return '';
  }

  const resolvedPath = path.resolve(reportPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return resolvedPath;
}
