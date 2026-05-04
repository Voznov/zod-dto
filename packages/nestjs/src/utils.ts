import assert from 'node:assert';

export const redecorateFromReflect = (source: unknown, destination: unknown): void => {
  assert(source, 'Redecorate from Reflect: source cannot be empty');
  assert(destination, 'Redecorate from Reflect: destination cannot be empty');

  Reflect.getMetadataKeys(source).forEach((key) => {
    Reflect.defineMetadata(key, Reflect.getMetadata(key, source), destination);
  });
};

export const mapValues = <K extends string, V, R>(obj: Record<K, V>, fn: (value: V, key: K) => R): Record<K, R> =>
  Object.fromEntries(Object.entries<V>(obj).map(([key, value]) => [key, fn(value, key as K)])) as Record<K, R>;
