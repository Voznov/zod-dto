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
const createdDtos: ZodDtoClass[] = [];

export const registerOnCreate = (hook: OnCreateHook): (() => void) => {
  onCreateHooks.push(hook);
  for (const dto of createdDtos) hook(dto);

  return () => {
    const index = onCreateHooks.indexOf(hook);
    if (index !== -1) onCreateHooks.splice(index, 1);
  };
};

const perClassZod = new WeakMap<new () => object, object>();

type ZodRunMethod = (payload: { value: unknown; issues: unknown[] }, ctx: unknown) => unknown;

export function ZodDto<T extends z.ZodRawShape>(objectSchema: ZodDtoClass<z.ZodObject<T>>, options?: ZodDtoOptions<T>): ZodDtoClass<z.ZodObject<T>>;
export function ZodDto<T extends z.ZodRawShape>(objectSchema: z.ZodObject<T>, options?: ZodDtoOptions<T>): ZodDtoClass<z.ZodObject<T>>;
export function ZodDto<Self>(): <T extends z.ZodRawShape>(objectSchema: z.ZodObject<T>, options?: ZodDtoOptions<T>) => ZodDtoClass<z.ZodObject<T>, Self>;
export function ZodDto<T extends z.ZodRawShape>(
  objectSchema?: z.ZodObject<T> | ZodDtoClass<z.ZodObject<T>>,
  options?: ZodDtoOptions<T>,
): ZodDtoClass<z.ZodObject<T>> | ((s: z.ZodObject<T>, o?: ZodDtoOptions<T>) => ZodDtoClass<z.ZodObject<T>>) {
  if (objectSchema === undefined) {
    return (s, o) => ZodDto(s, o);
  }
  if (isZodDtoClass(objectSchema)) {
    return objectSchema as ZodDtoClass<z.ZodObject<T>>;
  }

  const effectiveSchema = options?.in ? z.preprocess(options.in, objectSchema) : objectSchema;

  class Dto extends ZodDtoBase {
    toJSON(this: z.infer<z.ZodObject<T>>) {
      return options?.out ? options.out(this) : this;
    }
  }

  const result = Dto as unknown as ZodDtoClass<z.ZodObject<T>>;

  // Copy schema properties onto the DTO class — except `prototype` (non-configurable on
  // classes) and `_zod` (we install a per-class getter below so that subclasses and base
  // each resolve to their own `_zod` with a back-reference to the actual called class).
  const descriptors: Record<string, PropertyDescriptor> = Object.getOwnPropertyDescriptors(effectiveSchema);
  delete descriptors['prototype'];
  delete descriptors['_zod'];
  Object.defineProperties(result, descriptors);

  // Per-class `_zod`: Zod's internal nested parse (`element._zod.run(...)`) reads `_zod`
  // off whichever schema holds it — for `z.array(MyPoint)` that's `MyPoint`. Making `_zod`
  // a getter means every class (base + each `class X extends ZodDto(...)`) lazily gets its
  // own `_zod` keyed in a WeakMap, with the class captured in the getter's closure. The
  // `run` override then builds `new cls()` — the correct subclass, every time.
  const baseZod = effectiveSchema._zod as z.core.$ZodObjectInternals<T> & { run: ZodRunMethod };
  const originalRun = baseZod.run;
  Object.defineProperty(result, '_zod', {
    configurable: true,
    get(this: new () => object) {
      const cached = perClassZod.get(this);
      if (cached) return cached;

      const cls = this;
      const classZod = Object.create(baseZod) as { run: ZodRunMethod };
      classZod.run = (payload, ctx) => {
        const r = originalRun.call(baseZod, payload, ctx);
        if (payload.issues.length === 0 && typeof payload.value === 'object' && payload.value !== null) {
          payload.value = Object.assign(new cls(), payload.value);
        }

        return r;
      };
      perClassZod.set(this, classZod);

      return classZod;
    },
  });

  // Zod's `safeParse`/`parse`/async variants on schema prototypes are closures over the
  // original schema instance (`(data, params) => parse.safeParse(inst, data, params)`) —
  // they ignore `this`, so our `_zod` getter would never fire. Route these through the
  // `z.core` helpers that take the schema explicitly, so `this` (the called class,
  // possibly a user subclass) propagates to our getter.
  result.safeParse = function safeParse(this, data, params) {
    return z.core.safeParse(this, data, params) as ReturnType<typeof result.safeParse>;
  };
  result.parse = function parse(this, data, params) {
    return z.core.parse(this, data, params);
  };
  result.safeParseAsync = async function safeParseAsync(this, data, params) {
    return (await z.core.safeParseAsync(this, data, params)) as Awaited<ReturnType<typeof result.safeParseAsync>>;
  };
  result.parseAsync = async function parseAsync(this, data, params) {
    return await z.core.parseAsync(this, data, params);
  };

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

  createdDtos.push(result as ZodDtoClass);
  for (const hook of onCreateHooks) {
    hook(result as ZodDtoClass);
  }

  return result;
}

export function toDto<T extends Omit<ZodDtoClass, 'check'> & (new () => object)>(DtoClass: T, data: unknown[]): InstanceType<T>[];
export function toDto<T extends Omit<ZodDtoClass, 'check'> & (new () => object)>(DtoClass: T, data: unknown): InstanceType<T>;
export function toDto<T extends Omit<ZodDtoClass, 'check'> & (new () => object)>(DtoClass: T, data: unknown | unknown[]): InstanceType<T> | InstanceType<T>[] {
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
