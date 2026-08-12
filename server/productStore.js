'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_TIMESTAMP = '1970-01-01T00:00:00.000Z';
const CHANGESET_CACHE_LIMIT = 200;
const CHANGE_LOG_LIMIT = 2000;
const MAX_PRICE = 1_000_000;
const MAX_NAME_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_CATEGORY_LENGTH = 50;
const FALLBACK_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

function createValidationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function normaliseBoolean(value, field) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 1 || value === '1' || value === 'true') {
    return true;
  }
  if (value === 0 || value === '0' || value === 'false') {
    return false;
  }
  throw createValidationError(`${field} must be a boolean.`);
}

function normaliseInteger(value, field, { min, max, allowZero = true } = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
    throw createValidationError(`${field} must be an integer.`);
  }
  if (!allowZero && numeric === 0) {
    throw createValidationError(`${field} must be greater than zero.`);
  }
  if (typeof min === 'number' && numeric < min) {
    throw createValidationError(`${field} must be greater than or equal to ${min}.`);
  }
  if (typeof max === 'number' && numeric > max) {
    throw createValidationError(`${field} must be less than or equal to ${max}.`);
  }
  return numeric;
}

function normaliseNonEmptyString(value, field, maxLength) {
  if (typeof value !== 'string') {
    throw createValidationError(`${field} must be a string.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw createValidationError(`${field} cannot be empty.`);
  }
  if (typeof maxLength === 'number' && trimmed.length > maxLength) {
    throw createValidationError(`${field} cannot exceed ${maxLength} characters.`);
  }
  return trimmed;
}

function normaliseOptionalString(value, field, maxLength) {
  if (typeof value !== 'string') {
    throw createValidationError(`${field} must be a string.`);
  }
  if (typeof maxLength === 'number' && value.length > maxLength) {
    throw createValidationError(`${field} cannot exceed ${maxLength} characters.`);
  }
  return value;
}

function normaliseAssetPath(rawValue, { field, allowEmpty = true, requireAvif = false }) {
  if (rawValue === null || rawValue === undefined) {
    if (allowEmpty) {
      return '';
    }
    throw createValidationError(`${field} must be a string.`);
  }
  if (typeof rawValue !== 'string') {
    throw createValidationError(`${field} must be a string.`);
  }
  const trimmed = rawValue.trim();
  if (!trimmed) {
    if (allowEmpty) {
      return '';
    }
    throw createValidationError(`${field} cannot be empty.`);
  }
  const cleaned = trimmed.replace(/\\/g, '/');
  const normalised = path.posix.normalize(cleaned);
  if (!normalised.startsWith('assets/images/')) {
    throw createValidationError(`${field} must start with "assets/images/".`);
  }
  if (normalised.includes('..')) {
    throw createValidationError(`${field} cannot contain parent directory segments.`);
  }
  const lastDot = normalised.lastIndexOf('.');
  if (lastDot === -1) {
    throw createValidationError(`${field} must include a file extension.`);
  }
  const extension = normalised.slice(lastDot).toLowerCase();
  if (requireAvif) {
    if (extension !== '.avif') {
      throw createValidationError(`${field} must use the .avif extension.`);
    }
  } else if (!FALLBACK_IMAGE_EXTENSIONS.has(extension)) {
    throw createValidationError(
      `${field} must use one of the allowed extensions (${Array.from(FALLBACK_IMAGE_EXTENSIONS).join(', ')}).`
    );
  }
  return normalised;
}

const FIELD_SANITIZERS = {
  name: (value) => normaliseNonEmptyString(value, 'name', MAX_NAME_LENGTH),
  description: (value) => normaliseOptionalString(value, 'description', MAX_DESCRIPTION_LENGTH),
  price: (value) => normaliseInteger(value, 'price', { min: 1, max: MAX_PRICE, allowZero: false }),
  discount: (value, { product, pending }) => {
    const discountValue = normaliseInteger(value, 'discount', { min: 0, max: MAX_PRICE });
    const referencePrice = Object.prototype.hasOwnProperty.call(pending, 'price')
      ? pending.price
      : product.price;
    if (typeof referencePrice !== 'number' || Number.isNaN(referencePrice)) {
      throw createValidationError('Cannot apply discount without a valid price.');
    }
    if (discountValue > referencePrice) {
      throw createValidationError('discount cannot exceed price.');
    }
    return discountValue;
  },
  stock: (value) => normaliseBoolean(value, 'stock'),
  category: (value) => normaliseOptionalString(value, 'category', MAX_CATEGORY_LENGTH),
  image_path: (value) =>
    normaliseAssetPath(value, { field: 'image_path', allowEmpty: true, requireAvif: false }),
  image_avif_path: (value) =>
    normaliseAssetPath(value, { field: 'image_avif_path', allowEmpty: true, requireAvif: true }),
  order: (value) => normaliseInteger(value, 'order', { min: 0 }),
};

const FIELD_PRIORITIES = new Map([
  ['price', 10],
  ['discount', 20],
]);

function stableHash(input) {
  const value = String(input ?? '');
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    const charCode = value.charCodeAt(i);
    hash = (hash << 5) - hash + charCode;
    hash |= 0;
  }
  return Math.abs(hash);
}

class AsyncLock {
  constructor() {
    this._pending = Promise.resolve();
  }

  async runExclusive(fn) {
    const previous = this._pending;
    let release;
    this._pending = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeProductIdentityPart(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().split(/\s+/).join(' ').toLowerCase();
}

function getProductId(product) {
  const explicitId = typeof product?.id === 'string' ? product.id.trim() : '';
  if (explicitId) {
    return explicitId;
  }
  const explicitSlug = typeof product?.slug === 'string' ? product.slug.trim() : '';
  if (explicitSlug) {
    return explicitSlug;
  }
  return `${normalizeProductIdentityPart(product?.name)}::${normalizeProductIdentityPart(product?.description)}`;
}

function matchesProductId(product, productId) {
  if (getProductId(product) === productId) {
    return true;
  }
  return typeof product?.name === 'string' && product.name === productId;
}

function nowIso(override) {
  return override || new Date().toISOString();
}

function ensureFieldMeta(fieldMeta) {
  return {
    ts: fieldMeta?.ts || DEFAULT_TIMESTAMP,
    by: fieldMeta?.by || 'admin',
    rev: typeof fieldMeta?.rev === 'number' ? fieldMeta.rev : 0,
    base_rev: typeof fieldMeta?.base_rev === 'number' ? fieldMeta.base_rev : 0,
    changeset_id: fieldMeta?.changeset_id || null,
  };
}

class ProductStore {
  constructor(options = {}) {
    const rootDir = options.rootDir || path.join(__dirname, '..');
    this.dataPath = options.dataPath || path.join(rootDir, 'data', 'product_data.json');
    this.changeLogPath =
      options.changeLogPath || path.join(rootDir, 'data', 'product_changes.json');
    // Plan 030: injectable filesystem adapter (readFile/writeFile/rename/
    // unlink/mkdir/access) — defaults to node:fs/promises. Tests inject a
    // faulting wrapper; never exposed through HTTP.
    this._fs = options.fs || fs;
    this.lock = new AsyncLock();
    this._state = null;
    this._changeLog = null;
  }

  _ensureDir(filePath) {
    return this._fs.mkdir(path.dirname(filePath), { recursive: true });
  }

  async _readJson(filePath, fallback) {
    try {
      const raw = await this._fs.readFile(filePath, 'utf8');
      return JSON.parse(raw);
    } catch (error) {
      if (error.code === 'ENOENT') {
        await this._ensureDir(filePath);
        await this._fs.writeFile(filePath, JSON.stringify(fallback, null, 2));
        return JSON.parse(JSON.stringify(fallback));
      }
      throw error;
    }
  }

  // ── Plan 030: recoverable two-file commit protocol ─────────────────────────
  // Same-directory temp files + a transaction manifest. Recovery (on a fresh
  // ProductStore load) always yields the COMPLETE old pair or the COMPLETE
  // new pair — never a split or invalid JSON. Protocol:
  //   1. write+flush both .txn-tmp payloads
  //   2. write manifest { phase: 'staged' }
  //   3. validate both tmps parse and share the expected revision
  //   4. rename targets to .txn-backup
  //   5. write manifest { phase: 'renamed' }
  //   6. rename tmps onto targets
  //   7. delete manifest + backups + tmps
  async _commit(nextState, nextChangeLog) {
    const t = this._txnPaths();
    const f = this._fs;
    const rev = nextState.rev;
    const statePayload = JSON.stringify(nextState, null, 2);
    const logPayload = JSON.stringify(nextChangeLog, null, 2);

    await this._ensureDir(this.dataPath);

    await f.writeFile(t.stateTmp, statePayload, 'utf8');
    await f.writeFile(t.logTmp, logPayload, 'utf8');
    await f.writeFile(t.manifest, JSON.stringify({ phase: 'staged', rev }, null, 2), 'utf8');

    const parsedState = JSON.parse(await f.readFile(t.stateTmp, 'utf8'));
    const parsedLog = JSON.parse(await f.readFile(t.logTmp, 'utf8'));
    if (parsedState.rev !== rev || parsedLog.latest_rev !== rev) {
      // Abandon cleanly: the old targets were never touched.
      await f.unlink(t.stateTmp).catch(() => {});
      await f.unlink(t.logTmp).catch(() => {});
      await f.unlink(t.manifest).catch(() => {});
      throw new Error(
        `Transaction revision mismatch (state=${parsedState.rev}, log=${parsedLog.latest_rev}, expected=${rev})`
      );
    }

    await f.rename(this.dataPath, t.stateBackup).catch((e) => {
      if (e.code !== 'ENOENT') throw e;
    });
    await f.rename(this.changeLogPath, t.logBackup).catch((e) => {
      if (e.code !== 'ENOENT') throw e;
    });
    await f.writeFile(t.manifest, JSON.stringify({ phase: 'renamed', rev }, null, 2), 'utf8');

    await f.rename(t.stateTmp, this.dataPath);
    await f.rename(t.logTmp, this.changeLogPath);

    await f.unlink(t.manifest).catch(() => {});
    await f.unlink(t.stateBackup).catch(() => {});
    await f.unlink(t.logBackup).catch(() => {});
  }

  _txnPaths() {
    const dir = path.dirname(this.dataPath);
    return {
      dir,
      manifest: path.join(dir, '.product-txn.json'),
      stateTmp: `${this.dataPath}.txn-tmp`,
      stateBackup: `${this.dataPath}.txn-backup`,
      logTmp: `${this.changeLogPath}.txn-tmp`,
      logBackup: `${this.changeLogPath}.txn-backup`,
    };
  }

  async _exists(filePath) {
    try {
      await this._fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  // Deterministic recovery: after any interruption the store must end with
  // the COMPLETE old pair or the COMPLETE new pair — never a split. The new
  // pair is assembled from whatever complete sources exist (tmps first, then
  // targets — a crash mid-install may have already replaced one target), and
  // the old pair from the backups. If the new pair validates (shared
  // revision), it wins; otherwise the old pair is restored. Never guesses
  // between conflicting valid revisions.
  async _recoverTransaction() {
    const t = this._txnPaths();
    const f = this._fs;
    let manifest;
    try {
      manifest = JSON.parse(await f.readFile(t.manifest, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }

    const parseValid = async (stateSource, logSource) => {
      try {
        const s = JSON.parse(await f.readFile(stateSource, 'utf8'));
        const l = JSON.parse(await f.readFile(logSource, 'utf8'));
        return s.rev === l.latest_rev && s.rev === manifest.rev;
      } catch {
        return false;
      }
    };

    if (manifest.phase === 'staged') {
      // No renames happened yet — the old targets are complete. Complete the
      // commit from the tmps if they validate, else keep the old pair.
      if (await parseValid(t.stateTmp, t.logTmp)) {
        await f.rename(this.dataPath, t.stateBackup).catch((e) => {
          if (e.code !== 'ENOENT') throw e;
        });
        await f.rename(this.changeLogPath, t.logBackup).catch((e) => {
          if (e.code !== 'ENOENT') throw e;
        });
        await f.rename(t.stateTmp, this.dataPath).catch(() => {});
        await f.rename(t.logTmp, this.changeLogPath).catch(() => {});
      }
    } else {
      // phase 'renamed': backups exist and the crash may have happened mid
      // install (one target already replaced). Assemble the new pair from
      // whatever complete sources exist; the old pair from the backups.
      const stateSource = (await this._exists(t.stateTmp)) ? t.stateTmp : this.dataPath;
      const logSource = (await this._exists(t.logTmp)) ? t.logTmp : this.changeLogPath;
      if (await parseValid(stateSource, logSource)) {
        if (stateSource !== this.dataPath) {
          await f.rename(stateSource, this.dataPath).catch(() => {});
        }
        if (logSource !== this.changeLogPath) {
          await f.rename(logSource, this.changeLogPath).catch(() => {});
        }
      } else {
        if (await this._exists(t.stateBackup)) {
          await f.rename(t.stateBackup, this.dataPath).catch(() => {});
        }
        if (await this._exists(t.logBackup)) {
          await f.rename(t.logBackup, this.changeLogPath).catch(() => {});
        }
      }
    }

    await f.unlink(t.manifest).catch(() => {});
    await f.unlink(t.stateBackup).catch(() => {});
    await f.unlink(t.logBackup).catch(() => {});
    await f.unlink(t.stateTmp).catch(() => {});
    await f.unlink(t.logTmp).catch(() => {});
  }

  // Stale temps with no manifest are crash leftovers from an abandoned
  // commit — clean them (plan 030 step 3).
  async _cleanupStaleTxnFiles() {
    const t = this._txnPaths();
    if (await this._exists(t.manifest)) return;
    for (const stale of [t.stateTmp, t.stateBackup, t.logTmp, t.logBackup]) {
      await this._fs.unlink(stale).catch(() => {});
    }
  }

  async _loadState() {
    if (this._state && this._changeLog) {
      return;
    }
    // Plan 030: recover any interrupted transaction and clean stale temps
    // before reading — a fresh instance must never see a split pair.
    await this._recoverTransaction();
    await this._cleanupStaleTxnFiles();
    const defaults = {
      version: null,
      last_updated: null,
      rev: 0,
      products: [],
    };
    const changeDefaults = {
      latest_rev: 0,
      changes: [],
      changesets: {},
    };
    this._state = await this._readJson(this.dataPath, defaults);
    if (typeof this._state.rev !== 'number') {
      this._state.rev = 0;
    }
    this._state.products = Array.isArray(this._state.products) ? this._state.products : [];

    for (const product of this._state.products) {
      if (!Object.prototype.hasOwnProperty.call(product, 'image_avif_path')) {
        product.image_avif_path = '';
      }
      if (typeof product.rev !== 'number') {
        product.rev = this._state.rev || 0;
      }
      if (!product.field_last_modified || typeof product.field_last_modified !== 'object') {
        product.field_last_modified = {};
      }
      for (const key of Object.keys(product)) {
        if (key === 'field_last_modified' || key === 'rev') {
          continue;
        }
        if (!Object.prototype.hasOwnProperty.call(product.field_last_modified, key)) {
          product.field_last_modified[key] = ensureFieldMeta({
            ts: DEFAULT_TIMESTAMP,
            by: 'admin',
            rev: product.rev,
            base_rev: 0,
            changeset_id: null,
          });
        } else {
          product.field_last_modified[key] = ensureFieldMeta(product.field_last_modified[key]);
        }
      }
    }

    this._changeLog = await this._readJson(this.changeLogPath, changeDefaults);
    if (!Array.isArray(this._changeLog.changes)) {
      this._changeLog.changes = [];
    }
    if (!this._changeLog.changesets || typeof this._changeLog.changesets !== 'object') {
      this._changeLog.changesets = {};
    }
    if (typeof this._changeLog.latest_rev !== 'number') {
      this._changeLog.latest_rev = this._state.rev || 0;
    }
  }

  async _saveState() {
    await this._ensureDir(this.dataPath);
    await this._fs.writeFile(this.dataPath, JSON.stringify(this._state, null, 2));
  }

  async _saveChangeLog() {
    await this._ensureDir(this.changeLogPath);
    await this._fs.writeFile(this.changeLogPath, JSON.stringify(this._changeLog, null, 2));
  }

  async listProducts() {
    return this.lock.runExclusive(async () => {
      await this._loadState();
      return clone(this._state.products);
    });
  }

  async getProduct(productId) {
    return this.lock.runExclusive(async () => {
      await this._loadState();
      const product = this._state.products.find((item) => matchesProductId(item, productId));
      return product ? clone(product) : null;
    });
  }

  _pruneCaches(log = this._changeLog) {
    const changeKeys = Object.keys(log.changesets);
    if (changeKeys.length > CHANGESET_CACHE_LIMIT) {
      const sorted = changeKeys
        .map((key) => ({
          key,
          rev: log.changesets[key].rev ?? Number.MAX_SAFE_INTEGER,
        }))
        .sort((a, b) => a.rev - b.rev);
      const toRemove = sorted.slice(0, changeKeys.length - CHANGESET_CACHE_LIMIT);
      for (const { key } of toRemove) {
        delete log.changesets[key];
      }
    }
    if (log.changes.length > CHANGE_LOG_LIMIT) {
      log.changes.splice(0, log.changes.length - CHANGE_LOG_LIMIT);
    }
  }

  _ensureProductFields(product) {
    if (!product.field_last_modified || typeof product.field_last_modified !== 'object') {
      product.field_last_modified = {};
    }
    for (const key of Object.keys(product)) {
      if (key === 'field_last_modified' || key === 'rev') {
        continue;
      }
      product.field_last_modified[key] = ensureFieldMeta(product.field_last_modified[key]);
    }
  }

  async applyPatch(options) {
    const { productId, baseRev, fields, source = 'admin', changesetId, timestamp } = options;

    if (!productId) {
      const error = new Error('productId is required');
      error.statusCode = 400;
      throw error;
    }
    if (typeof baseRev !== 'number' || Number.isNaN(baseRev)) {
      const error = new Error('base_rev must be a number');
      error.statusCode = 400;
      throw error;
    }
    if (
      !fields ||
      typeof fields !== 'object' ||
      Array.isArray(fields) ||
      !Object.keys(fields).length
    ) {
      const error = new Error('fields must be a non-empty object');
      error.statusCode = 400;
      throw error;
    }
    if (!changesetId) {
      const error = new Error('changeset_id is required for idempotency');
      error.statusCode = 400;
      throw error;
    }

    return this.lock.runExclusive(async () => {
      await this._loadState();

      const cached = this._changeLog.changesets[changesetId];
      if (cached) {
        return clone(cached.response);
      }

      // Plan 030 step 2: stage on clones — the published in-memory state and
      // the idempotency cache are only replaced after the durable commit
      // succeeds, so a failed commit never leaves a false-success cache.
      const nextState = clone(this._state);
      const nextChangeLog = clone(this._changeLog);

      const idx = nextState.products.findIndex((item) => matchesProductId(item, productId));
      if (idx === -1) {
        const error = new Error('Product not found');
        error.statusCode = 404;
        throw error;
      }

      const product = clone(nextState.products[idx]);
      this._ensureProductFields(product);

      const now = nowIso(timestamp);
      const acceptedFields = [];
      const acceptedFieldPayload = {};
      const conflicts = [];
      const fieldEntries = Object.entries(fields);
      const sanitizedUpdates = {};

      const sanitizableEntries = fieldEntries
        .filter(
          ([field]) =>
            Object.prototype.hasOwnProperty.call(product, field) && FIELD_SANITIZERS[field]
        )
        .sort((a, b) => {
          const priorityA = FIELD_PRIORITIES.get(a[0]) ?? 100;
          const priorityB = FIELD_PRIORITIES.get(b[0]) ?? 100;
          if (priorityA === priorityB) {
            return 0;
          }
          return priorityA - priorityB;
        });

      for (const [field, rawValue] of sanitizableEntries) {
        const sanitizer = FIELD_SANITIZERS[field];
        if (!sanitizer) {
          continue;
        }
        try {
          sanitizedUpdates[field] = sanitizer(rawValue, { product, pending: sanitizedUpdates });
        } catch (validationError) {
          if (!validationError || typeof validationError.statusCode !== 'number') {
            validationError.statusCode = 400;
          }
          throw validationError;
        }
      }

      for (const [field, rawValue] of fieldEntries) {
        if (!Object.prototype.hasOwnProperty.call(product, field) || !FIELD_SANITIZERS[field]) {
          conflicts.push({
            field,
            server_value: Object.prototype.hasOwnProperty.call(product, field)
              ? product[field]
              : null,
            client_value: rawValue,
            resolved_to: Object.prototype.hasOwnProperty.call(product, field)
              ? product[field]
              : null,
            reason: 'field_not_supported',
          });
          continue;
        }

        const clientValue = sanitizedUpdates[field];
        const currentValue = product[field];
        const meta = ensureFieldMeta(product.field_last_modified[field]);

        if (JSON.stringify(currentValue) === JSON.stringify(clientValue)) {
          continue;
        }

        let accept;
        let resolutionReason;

        if (baseRev > meta.rev) {
          accept = true;
          resolutionReason = 'client_base_rev_higher';
        } else if (baseRev < meta.rev) {
          accept = false;
          resolutionReason = 'server_has_newer_revision';
        } else {
          const existingTs = Date.parse(meta.ts || DEFAULT_TIMESTAMP);
          const incomingTs = Date.parse(now);
          if (incomingTs > existingTs) {
            accept = true;
            resolutionReason = 'newer_timestamp';
          } else if (incomingTs < existingTs) {
            accept = false;
            resolutionReason = 'older_timestamp';
          } else if (meta.by === source) {
            const existingHash = stableHash(meta.changeset_id || '');
            const newHash = stableHash(changesetId);
            accept = newHash > existingHash;
            resolutionReason = 'stable_hash_tiebreaker';
          } else if (meta.by === 'admin' && source !== 'admin') {
            accept = false;
            resolutionReason = 'admin_precedence';
          } else if (source === 'admin') {
            accept = true;
            resolutionReason = 'admin_precedence';
          } else {
            const existingHash = stableHash(meta.changeset_id || '');
            const newHash = stableHash(changesetId);
            accept = newHash > existingHash;
            resolutionReason = 'stable_hash_tiebreaker';
          }
        }

        if (accept) {
          product[field] = clientValue;
          product.field_last_modified[field] = {
            ts: now,
            by: source,
            rev: nextState.rev + 1,
            base_rev: baseRev,
            changeset_id: changesetId,
          };
          acceptedFields.push(field);
          acceptedFieldPayload[field] = {
            value: clientValue,
            by: source,
            ts: now,
            reason: resolutionReason,
          };
        } else {
          conflicts.push({
            field,
            server_value: currentValue,
            client_value: clientValue,
            resolved_to: currentValue,
            reason: resolutionReason,
          });
        }
      }

      if (!acceptedFields.length && !conflicts.length) {
        const response = {
          product,
          rev: nextState.rev,
          accepted_fields: [],
          conflicts: [],
          last_updated: nextState.last_updated,
          version: nextState.version,
        };
        nextChangeLog.changesets[changesetId] = { rev: nextState.rev, response };
        this._pruneCaches(nextChangeLog);
        await this._commit(nextState, nextChangeLog);
        this._state = nextState;
        this._changeLog = nextChangeLog;
        return clone(response);
      }

      if (acceptedFields.length) {
        nextState.rev += 1;
        product.rev = nextState.rev;
        nextState.last_updated = now;
        nextState.version = now.replace(/[-:TZ.]/g, '').slice(0, 15);
        nextState.products[idx] = product;
      }

      const response = {
        product,
        rev: nextState.rev,
        accepted_fields: acceptedFields,
        conflicts,
        last_updated: nextState.last_updated,
        version: nextState.version,
      };

      nextChangeLog.changesets[changesetId] = { rev: nextState.rev, response };

      if (acceptedFields.length) {
        nextChangeLog.latest_rev = nextState.rev;
        nextChangeLog.changes.push({
          rev: nextState.rev,
          timestamp: now,
          product_id: productId,
          source,
          changeset_id: changesetId,
          accepted_fields: Object.entries(acceptedFieldPayload).map(([field, metaPayload]) => ({
            field,
            value: metaPayload.value,
            by: metaPayload.by,
            ts: metaPayload.ts,
            reason: metaPayload.reason,
          })),
          conflicts,
          last_updated: nextState.last_updated,
          version: nextState.version,
          product_snapshot: clone(product),
        });
      }

      this._pruneCaches(nextChangeLog);
      await this._commit(nextState, nextChangeLog);
      // Plan 030 step 2/4: publish memory + idempotency cache only after the
      // durable commit succeeded.
      this._state = nextState;
      this._changeLog = nextChangeLog;
      return clone(response);
    });
  }

  async getChangesSince(revision) {
    const since = typeof revision === 'number' && !Number.isNaN(revision) ? revision : 0;
    return this.lock.runExclusive(async () => {
      await this._loadState();
      const relevant = this._changeLog.changes.filter((entry) => entry.rev > since);
      return {
        from_rev: since,
        to_rev: this._state.rev,
        changes: clone(relevant),
      };
    });
  }
}

function createProductStore(options = {}) {
  return new ProductStore(options);
}

module.exports = {
  ProductStore,
  createProductStore,
  stableHash,
};
