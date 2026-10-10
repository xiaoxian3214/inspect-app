const CLEANUP_POLICY_KEY = '__QARMA_CLEANUP_POLICY__'

const DEFAULT_POLICY = {
  enabled: true,
  retentionDays: 7,
  maxCacheSizeMB: 2048
}

function normalizeNumber(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.floor(n)))
}

export function getCleanupPolicy() {
  const stored = uni.getStorageSync(CLEANUP_POLICY_KEY) || {}
  return {
    enabled: stored.enabled !== undefined ? !!stored.enabled : DEFAULT_POLICY.enabled,
    retentionDays: normalizeNumber(stored.retentionDays, DEFAULT_POLICY.retentionDays, 1, 90),
    maxCacheSizeMB: normalizeNumber(stored.maxCacheSizeMB, DEFAULT_POLICY.maxCacheSizeMB, 100, 10240)
  }
}

export function saveCleanupPolicy(policy = {}) {
  const merged = {
    ...getCleanupPolicy(),
    ...policy
  }
  const normalized = {
    enabled: !!merged.enabled,
    retentionDays: normalizeNumber(merged.retentionDays, DEFAULT_POLICY.retentionDays, 1, 90),
    maxCacheSizeMB: normalizeNumber(merged.maxCacheSizeMB, DEFAULT_POLICY.maxCacheSizeMB, 100, 10240)
  }
  uni.setStorageSync(CLEANUP_POLICY_KEY, normalized)
  return normalized
}
