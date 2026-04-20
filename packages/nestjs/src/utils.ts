export const mapValues = <K extends string, V, R>(obj: Record<K, V>, fn: (value: V, key: K) => R): Record<K, R> =>
  Object.fromEntries(Object.entries<V>(obj).map(([key, value]) => [key, fn(value, key as K)])) as Record<K, R>;
