import { type z } from 'zod';

type ZodDtoMethods<S extends z.ZodObject> = {
  extend<U extends z.core.$ZodLooseShape>(shape: U): ZodDtoClass<z.ZodObject<z.core.util.Extend<S['shape'], U>>>;
  pick<M extends z.core.util.Mask<keyof S['shape']>>(
    mask: M & Record<Exclude<keyof M, keyof S['shape']>, never>,
  ): ZodDtoClass<z.ZodObject<z.core.util.Flatten<Pick<S['shape'], Extract<keyof S['shape'], keyof M>>>>>;
  omit<M extends z.core.util.Mask<keyof S['shape']>>(
    mask: M & Record<Exclude<keyof M, keyof S['shape']>, never>,
  ): ZodDtoClass<z.ZodObject<z.core.util.Flatten<Omit<S['shape'], Extract<keyof S['shape'], keyof M>>>>>;
};

/**
 * A DTO class. The optional `Self` generic narrows Zod's inferred output type
 * (via Zod's own `$ZodNarrow`) — pass it as `ZodDto<MyPoint>(...)` when subclassing
 * via `class MyPoint extends ZodDto<MyPoint>(...)`, and subclass methods will
 * propagate through `z.infer` in nested positions (`z.array(MyPoint)`,
 * `z.object({ p: MyPoint })`, discriminated unions, ...). Default `Self = z.infer<S>`
 * matches plain (non-subclassed) DTO behavior.
 */
export type ZodDtoClass<S extends z.ZodObject = z.ZodObject, Self = z.infer<S>> = Omit<z.core.$ZodNarrow<S, Self>, keyof ZodDtoMethods<S>> &
  ZodDtoMethods<S> &
  (new () => z.infer<S>);

export class ZodDtoBase {}

export const isZodDtoClass = (value: unknown): value is ZodDtoClass => typeof value === 'function' && (value === ZodDtoBase || value.prototype instanceof ZodDtoBase);
