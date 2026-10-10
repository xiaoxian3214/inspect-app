export function shouldAcceptClick(lastAcceptedAt, now, intervalMs) {
  const interval = Math.max(0, Number(intervalMs) || 0)
  return interval === 0 || now - lastAcceptedAt >= interval
}
