/**
 * Remembers which webhook deliveries were already handled.
 *
 * GitHub retries deliveries, so without this a retry would create a second Check Run
 * for the same commit (Phase 2 완료 기준: "중복 이벤트 방지").
 *
 * In-memory and therefore per-process: restarts forget, and a second replica would
 * not share it. Adequate for a single instance; replace with Redis (the store the
 * product plan already calls for) before running more than one.
 */
export interface DeliveryLog {
  /** Returns true the first time a delivery id is seen, false on every repeat. */
  claim(deliveryId: string): boolean;
}

export function createInMemoryDeliveryLog(maxEntries = 10_000): DeliveryLog {
  const seen = new Set<string>();

  return {
    claim(deliveryId: string): boolean {
      if (seen.has(deliveryId)) return false;

      if (seen.size >= maxEntries) {
        // Set preserves insertion order, so this drops the oldest id.
        const oldest = seen.values().next();
        if (!oldest.done) seen.delete(oldest.value);
      }

      seen.add(deliveryId);
      return true;
    },
  };
}
