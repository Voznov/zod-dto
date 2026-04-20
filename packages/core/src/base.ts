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

export type ZodDtoClass<S extends z.ZodObject = z.ZodObject> = Omit<S, keyof ZodDtoMethods<S>> & ZodDtoMethods<S> & (new () => z.infer<S>);

export class ZodDtoBase {}

export const isZodDtoClass = (value: unknown): value is ZodDtoClass => typeof value === 'function' && (value === ZodDtoBase || value.prototype instanceof ZodDtoBase);
