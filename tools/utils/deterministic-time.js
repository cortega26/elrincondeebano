let cachedDate = null;
let warned = false;

const FALLBACK_DATE = new Date(0);
const EPOCH_SECONDS_CUTOFF_MS = 1e12;

function warnOnce(message) {
  if (warned) return;
  warned = true;
  console.warn(message);
}

function parseEpochSeconds(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return null;
  }
  const ms = value < EPOCH_SECONDS_CUTOFF_MS ? value * 1000 : value;
  return new Date(ms);
}

function resolveBuildDate() {
  if (cachedDate) {
    return cachedDate;
  }

  const override = process.env.BUILD_TIMESTAMP;
  if (override && String(override).trim()) {
    const parsed = new Date(String(override).trim());
    if (!Number.isNaN(parsed.getTime())) {
      cachedDate = parsed;
      return cachedDate;
    }
    warnOnce('BUILD_TIMESTAMP is invalid; falling back to SOURCE_DATE_EPOCH or epoch 0.');
  }

  const epoch = process.env.SOURCE_DATE_EPOCH;
  if (epoch && String(epoch).trim()) {
    const parsed = parseEpochSeconds(epoch);
    if (parsed && !Number.isNaN(parsed.getTime())) {
      cachedDate = parsed;
      return cachedDate;
    }
    warnOnce('SOURCE_DATE_EPOCH is invalid; falling back to epoch 0.');
  }

  warnOnce('Deterministic build timestamp not set; using 1970-01-01T00:00:00Z.');
  cachedDate = FALLBACK_DATE;
  return cachedDate;
}

function getDeterministicDate() {
  return resolveBuildDate();
}

function getDeterministicTimestamp() {
  return resolveBuildDate().toISOString();
}

module.exports = {
  getDeterministicDate,
  getDeterministicTimestamp,
};
