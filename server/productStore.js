'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const DEFAULT_TIMESTAMP = '1970-01-01T00:00:00.000Z';
const CHANGESET_CACHE_LIMIT = 200;
const CHANGE_LOG_LIMIT = 2000;

function stableHash(input) {
  const value = String(input ?? '');
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    const charCode = value.charCodeAt(i);
    hash = ((hash << 5) - hash) + charCode;
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

function ensureDir(filePath) {
  return fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      await ensureDir(filePath);
      await fs.writeFile(filePath, JSON.stringify(fallback, null, 2));
      return JSON.parse(JSON.stringify(fallback));
    }
    throw error;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getProductId(product) {
  return product.id || product.slug || product.name;
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
    this.changeLogPath = options.changeLogPath || path.join(rootDir, 'data', 'product_changes.json');
    this.lock = new AsyncLock();
    this._state = null;
    this._changeLog = null;
  }

  async _loadState() {
    if (this._state && this._changeLog) {
      return;
    }
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
    this._state = await readJson(this.dataPath, defaults);
    if (typeof this._state.rev !== 'number') {
      this._state.rev = 0;
    }
    this._state.products = Array.isArray(this._state.products) ? this._state.products : [];

    for (const product of this._state.products) {
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

    this._changeLog = await readJson(this.changeLogPath, changeDefaults);
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
    await ensureDir(this.dataPath);
    await fs.writeFile(this.dataPath, JSON.stringify(this._state, null, 2));
  }

  async _saveChangeLog() {
    await ensureDir(this.changeLogPath);
    await fs.writeFile(this.changeLogPath, JSON.stringify(this._changeLog, null, 2));
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
      const product = this._state.products.find((item) => getProductId(item) === productId);
      return product ? clone(product) : null;
    });
  }

  _pruneCaches() {
    const changeKeys = Object.keys(this._changeLog.changesets);
    if (changeKeys.length > CHANGESET_CACHE_LIMIT) {
      const sorted = changeKeys
        .map((key) => ({
          key,
          rev: this._changeLog.changesets[key].rev ?? Number.MAX_SAFE_INTEGER,
        }))
        .sort((a, b) => a.rev - b.rev);
      const toRemove = sorted.slice(0, changeKeys.length - CHANGESET_CACHE_LIMIT);
      for (const { key } of toRemove) {
        delete this._changeLog.changesets[key];
      }
    }
    if (this._changeLog.changes.length > CHANGE_LOG_LIMIT) {
      this._changeLog.changes.splice(0, this._changeLog.changes.length - CHANGE_LOG_LIMIT);
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
    const {
      productId,
      baseRev,
      fields,
      source = 'admin',
      changesetId,
      timestamp,
    } = options;

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
    if (!fields || typeof fields !== 'object' || Array.isArray(fields) || !Object.keys(fields).length) {
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

      const idx = this._state.products.findIndex((item) => getProductId(item) === productId);
      if (idx === -1) {
        const error = new Error('Product not found');
        error.statusCode = 404;
        throw error;
      }

      const product = clone(this._state.products[idx]);
      this._ensureProductFields(product);

      const now = nowIso(timestamp);
      const acceptedFields = [];
      const acceptedFieldPayload = {};
      const conflicts = [];

      for (const [field, clientValue] of Object.entries(fields)) {
        if (!Object.prototype.hasOwnProperty.call(product, field)) {
          conflicts.push({
            field,
            server_value: null,
            client_value: clientValue,
            resolved_to: null,
            reason: 'field_not_supported',
          });
          continue;
        }

        const currentValue = product[field];
        const meta = ensureFieldMeta(product.field_last_modified[field]);

        if (JSON.stringify(currentValue) === JSON.stringify(clientValue)) {
          continue;
        }

        let accept = false;
        let resolutionReason = 'client_base_rev_higher';

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
            rev: this._state.rev + 1,
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
          rev: this._state.rev,
          accepted_fields: [],
          conflicts: [],
          last_updated: this._state.last_updated,
          version: this._state.version,
        };
        this._changeLog.changesets[changesetId] = { rev: this._state.rev, response };
        this._pruneCaches();
        await this._saveChangeLog();
        return clone(response);
      }

      if (acceptedFields.length) {
        this._state.rev += 1;
        product.rev = this._state.rev;
        this._state.last_updated = now;
        this._state.version = now.replace(/[-:TZ.]/g, '').slice(0, 15);
        this._state.products[idx] = product;
      }

      const response = {
        product,
        rev: this._state.rev,
        accepted_fields: acceptedFields,
        conflicts,
        last_updated: this._state.last_updated,
        version: this._state.version,
      };

      this._changeLog.changesets[changesetId] = { rev: this._state.rev, response };

      if (acceptedFields.length) {
        this._changeLog.latest_rev = this._state.rev;
        this._changeLog.changes.push({
          rev: this._state.rev,
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
          last_updated: this._state.last_updated,
          version: this._state.version,
          product_snapshot: clone(product),
        });
      }

      this._pruneCaches();
      await this._saveState();
      await this._saveChangeLog();
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
