#!/usr/bin/env node

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

function parseArgs(argv) {
  const parsed = { src: '', dest: '', maxSize: 0 };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--src') {
      parsed.src = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (token === '--dest') {
      parsed.dest = argv[index + 1] || '';
      index += 1;
      continue;
    }
    if (token === '--max-size') {
      parsed.maxSize = Number.parseInt(argv[index + 1] || '0', 10) || 0;
      index += 1;
    }
  }
  return parsed;
}

function applyOutputFormat(pipeline, destination) {
  const extension = path.extname(destination).toLowerCase();
  if (extension === '.webp') {
    return pipeline.webp({ quality: 85 });
  }
  if (extension === '.png') {
    return pipeline.png();
  }
  if (extension === '.jpg' || extension === '.jpeg') {
    return pipeline.jpeg({ quality: 90, mozjpeg: true });
  }
  throw new Error(`Unsupported fallback extension: ${extension}`);
}

async function main() {
  const { src, dest, maxSize } = parseArgs(process.argv.slice(2));
  if (!src || !dest) {
    throw new Error('Usage: node tools/convert-avif-fallback.mjs --src <path> --dest <path> [--max-size 1000]');
  }

  await mkdir(path.dirname(dest), { recursive: true });

  let pipeline = sharp(src).rotate();
  if (maxSize > 0) {
    pipeline = pipeline.resize({
      width: maxSize,
      height: maxSize,
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  await applyOutputFormat(pipeline, dest).toFile(dest);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
