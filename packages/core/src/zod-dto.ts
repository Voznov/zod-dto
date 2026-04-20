import { z } from 'zod';
import { isZodDtoClass, ZodDtoBase, type ZodDtoClass } from './base';
import { formatZodIssues, ZodDtoValidationError } from './errors';

export type { ZodDtoClass } from './base';
export { isZodDtoClass } from './base';

export interface ZodDtoOptions<T extends z.ZodRawShape = z.ZodRawShape> {
  /** Runs as `z.preprocess` so nested DTOs resolve their own hook during a parent's `safeParse`. */
  in?: (data: unknown) => unknown;
  /**
   * Becomes `toJSON` on the instance prototype — `JSON.stringify` picks it up automatically,
   * so nested DTOs serialize through their own `out` during a parent's `JSON.stringify`.
   */
  out?: (parsed: z.infer<z.ZodObject<T>>) => unknown;
}

type OnCreateHook = (dtoClass: ZodDtoClass) => void;

const onCreateHooks: OnCreateHook[] = [];

export const registerOnCreate = (hook: OnCreateHook): (() => void) => {
  onCreateHooks.push(hook);

  return () => {
    const index = onCreateHooks.indexOf(hook);
    if (index !== -1) onCreateHooks.splice(index, 1);
  };
};

export function ZodDto<T extends z.ZodRawShape>(objectSchema: z.ZodObject<T>, options?: ZodDtoOptions<T>): ZodDtoClass<z.ZodObject<T>> {
  const effectiveSchema = options?.in ? z.preprocess(options.in, objectSchema) : objectSchema;

  class Dto extends ZodDtoBase {
    toJSON(this: z.infer<z.ZodObject<T>>) {
      return options?.out ? options.out(this) : this;
    }
  }

  const result = Dto as unknown as ZodDtoClass<z.ZodObject<T>>;
  const descriptors = Object.getOwnPropertyDescriptors(effectiveSchema);
  // 'prototype' is non-configurable on classes — skip it to avoid TypeError
  delete descriptors['prototype'];
  Object.defineProperties(result, descriptors);

  // Override Zod wrapper methods so they reference `result` (the DTO class) directly.
  // Without this, TestDto.optional() wraps effectiveSchema (the raw ZodObject), not TestDto,
  // so isZodDtoClass() misses the nested DTO during swagger generation.
  result.optional = function () {
    return z.optional(this);
  };
  result.nullable = function () {
    return z.nullable(this);
  };
  result.array = function () {
    return z.array(this);
  };

  // Delegate to raw objectSchema (bypass the `in`-wrapped ZodPipe) and re-wrap as a DTO.
  // Options don't forward: a narrowed/extended shape would invalidate `out`'s typed argument.
  result.extend = (augmentation) => ZodDto(objectSchema.extend(augmentation));
  result.omit = (mask) => ZodDto(objectSchema.omit(mask));
  result.pick = (mask) => ZodDto(objectSchema.pick(mask));

  for (const hook of onCreateHooks) {
    hook(result as ZodDtoClass);
  }

  return result;
}

// Walks the schema tree alongside parsed data, wrapping ZodDtoClass nodes into class instances
// so their prototype `toJSON` (from `out`) fires during JSON.stringify of the outer value.
function hydrate(schema: z.core.$ZodType, data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable || schema instanceof z.ZodDefault || schema instanceof z.ZodReadonly || schema instanceof z.ZodCatch) {
    return hydrate(schema.unwrap(), data);
  }
  if (schema instanceof z.ZodPipe) {
    // z.preprocess produces ZodPipe(in: ZodTransform, out: schema); hydrate the output side.
    return hydrate(schema.out, data);
  }
  if (schema instanceof z.ZodArray && Array.isArray(data)) {
    const element = schema.unwrap();

    return data.map((item) => hydrate(element, item));
  }
  if (schema instanceof z.ZodObject && typeof data === 'object') {
    const src = data as Record<string, unknown>;
    const hydrated: Record<string, unknown> = {};
    for (const [key, fieldSchema] of Object.entries(schema.shape)) {
      if (key in src) hydrated[key] = hydrate(fieldSchema, src[key]);
    }
    if (isZodDtoClass(schema)) {
      return Object.assign(new schema(), hydrated);
    }

    return hydrated;
  }

  return data;
}

export function toDto<T extends ZodDtoClass>(DtoClass: T, data: unknown[]): InstanceType<T>[];
export function toDto<T extends ZodDtoClass>(DtoClass: T, data: unknown): InstanceType<T>;
export function toDto<T extends ZodDtoClass>(DtoClass: T, data: unknown | unknown[]): InstanceType<T> | InstanceType<T>[] {
  const isArray = Array.isArray(data);
  const items = isArray ? data : [data];

  const results = items.map((item) => {
    const result = DtoClass.safeParse(item);
    if (!result.success) {
      throw new ZodDtoValidationError(formatZodIssues(result.error.issues));
    }

    return hydrate(DtoClass, result.data) as InstanceType<T>;
  });

  return isArray ? results : results[0];
}
