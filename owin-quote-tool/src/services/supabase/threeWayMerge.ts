type JsonDocument = Record<string, unknown>;

export interface ThreeWayMergeOptions<T extends JsonDocument> {
  /** Fields controlled by a separate server operation (for example catalogue order). */
  remoteWins?: readonly (keyof T)[];
  /** Optional field-specific merge for append-only collections. */
  mergeField?: Partial<{
    [K in keyof T]: (base: T[K] | undefined, local: T[K], remote: T[K]) => T[K];
  }>;
}

/** JSON documents are normalized before reaching this layer, so structural equality is sufficient. */
export function documentsEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Merge a stale local document with the newest server document.
 *
 * A field changed locally relative to the acknowledged base keeps the local
 * value. Every untouched field adopts the newest server value. Repeating this
 * after another CAS conflict is deterministic: the same-field local edit wins,
 * while independent edits from other browsers are retained.
 */
export function mergeTopLevel<T extends JsonDocument>(
  base: T | null,
  local: T,
  remote: T,
  options: ThreeWayMergeOptions<T> = {},
): T {
  const result = { ...remote } as T;
  const remoteWins = new Set<keyof T>(options.remoteWins ?? []);
  const keys = new Set<keyof T>([
    ...(Object.keys(remote) as (keyof T)[]),
    ...(Object.keys(local) as (keyof T)[]),
  ]);

  for (const key of keys) {
    if (remoteWins.has(key)) continue;
    const localValue = local[key];
    const remoteValue = remote[key];
    const baseValue = base?.[key];
    const localChanged = base === null || !documentsEqual(localValue, baseValue);
    if (!localChanged) continue;
    const customMerge = options.mergeField?.[key];
    result[key] = customMerge
      ? customMerge(baseValue, localValue, remoteValue)
      : localValue;
  }

  return result;
}

export function mergeAppendOnlyById<T extends { id: string }>(remote: T[], local: T[]): T[] {
  const merged = new Map(remote.map((value) => [value.id, value]));
  for (const value of local) merged.set(value.id, value);
  return Array.from(merged.values()).sort((left, right) => {
    const leftTime = 'createdAt' in left ? String(left.createdAt) : '';
    const rightTime = 'createdAt' in right ? String(right.createdAt) : '';
    return leftTime.localeCompare(rightTime) || left.id.localeCompare(right.id);
  });
}
