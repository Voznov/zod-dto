import { z } from 'zod';
import { ZodDtoBase, type ZodDtoClass } from './base';
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
  const preprocessed = options?.in ? z.preprocess(options.in, objectSchema) : objectSchema;

  class Dto extends ZodDtoBase {
    toJSON(this: z.infer<z.ZodObject<T>>) {
      return options?.out ? options.out(this) : this;
    }
  }

  const effectiveSchema = preprocessed.transform((data) => Object.assign(new Dto(), data));

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

  // Delegate to raw objectSchema (bypass the `in`/`transform`-wrapped pipe) and re-wrap as a DTO.
  // Options don't forward: a narrowed/extended shape would invalidate `out`'s typed argument.
  result.extend = (augmentation) => ZodDto(objectSchema.extend(augmentation));
  result.omit = (mask) => ZodDto(objectSchema.omit(mask));
  result.pick = (mask) => ZodDto(objectSchema.pick(mask));

  for (const hook of onCreateHooks) {
    hook(result as ZodDtoClass);
  }

  return result;
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

    return result.data as InstanceType<T>;
  });

  return isArray ? results : results[0];
}
