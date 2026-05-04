import 'reflect-metadata';
import { ApiExtraModels, ApiResponse } from '@nestjs/swagger';
import { toDto, type ToDtoOptions, type ZodDtoClass, ZodDtoValidationError } from '@voznov/zod-dto';
import { z } from 'zod';
import { applySwaggerDecorators } from './swagger';
import { redecorateFromReflect } from './utils';

type AsResponseOptions = { status?: number; description?: string };
export type ZodResponseOptions = ToDtoOptions & AsResponseOptions;

// Inlined (not re-exported from core): cross-module import widens this conditional type and disables the strict return-type check below.
type ToDtoResult<T extends z.ZodType> = T extends new () => infer U ? U : z.infer<T>;
type Method<T extends z.ZodType> = (...args: never[]) => ToDtoResult<T> | Promise<ToDtoResult<T>>;

/** Thrown when a `@ZodSerialize`-decorated method returns a value that fails the schema */
export class ZodDtoSerializationError extends ZodDtoValidationError {}

const resolveSchema = (schema: z.ZodType | undefined, target: object, propertyKey: string | symbol, decoratorName: string): z.ZodType => {
  if (schema) return schema;
  const rt: unknown = Reflect.getMetadata('design:returntype', target, propertyKey);
  if (rt instanceof z.ZodType) return rt;
  const rtName = rt instanceof Object && 'name' in rt && typeof rt.name === 'string' ? rt.name : 'unknown';
  throw new Error(
    `${decoratorName} on ${target.constructor.name}.${String(propertyKey)}: ` +
      `no Zod schema provided and design:returntype "${rtName}" is not a Zod schema. ` +
      `Pass it explicitly, e.g. ${decoratorName}(z.array(MySchema)).`,
  );
};

const wrapMethod =
  (schema: z.ZodType | undefined, options: ToDtoOptions | undefined, decoratorName: string): MethodDecorator =>
  (target, methodName, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    if (typeof originalMethod !== 'function') {
      throw new Error(`${decoratorName}: ${target.constructor.name}.${String(methodName)} is not a method`);
    }

    const resolved = resolveSchema(schema, target, methodName, decoratorName);
    const serialize = toDto.with({ errorClass: ZodDtoSerializationError, ...options });

    descriptor.value = {
      [methodName](...args: unknown[]) {
        const out = originalMethod.apply(this, args);
        if (out instanceof Promise) {
          return out.then((v) => serialize(resolved, v));
        }

        return serialize(resolved, out);
      },
    }[methodName as string];

    redecorateFromReflect(originalMethod, descriptor.value);
  };

const wrapApiResponse =
  (schema: z.ZodType | undefined, options: AsResponseOptions | undefined): MethodDecorator =>
  (target, propertyKey, descriptor) => {
    const resolved = resolveSchema(schema, target, propertyKey, '@ZodResponse');
    const { so, innerSchemas } = applySwaggerDecorators(resolved);
    ApiResponse({ status: options?.status ?? 200, description: options?.description, schema: so })(target, propertyKey, descriptor);
    if (innerSchemas.size > 0) {
      const classTarget = typeof target === 'function' ? target : target.constructor;
      ApiExtraModels(...innerSchemas)(classTarget);
    }
  };

/** Loose: no schema → resolves from `design:returntype` at runtime; no compile-time check on return. */
export function ZodSerialize(schema?: undefined, options?: ToDtoOptions): MethodDecorator;
/** Strict: schema given → method return type compile-time-checked against schema output. */
export function ZodSerialize<Schema extends z.ZodType | ZodDtoClass>(
  schema: Schema,
  options?: ToDtoOptions,
): <T extends Method<Schema>>(target: object, key: string | symbol, descriptor: TypedPropertyDescriptor<T>) => void;
export function ZodSerialize(schema?: z.ZodType, options?: ToDtoOptions): MethodDecorator {
  return wrapMethod(schema, options, '@ZodSerialize');
}

/** Loose: no schema → resolves from `design:returntype` at runtime; no compile-time check. */
export function ZodResponse(schema?: undefined, options?: ZodResponseOptions): MethodDecorator;
/** Strict: schema given → method return type compile-time-checked + emits `@ApiResponse` swagger metadata. */
export function ZodResponse<Schema extends z.ZodType | ZodDtoClass>(
  schema: Schema,
  options?: ZodResponseOptions,
): <T extends Method<Schema>>(target: object, key: string | symbol, descriptor: TypedPropertyDescriptor<T>) => void;
export function ZodResponse(schema?: z.ZodType, options?: ZodResponseOptions): MethodDecorator {
  return (target, propertyKey, descriptor) => {
    wrapMethod(schema, options, '@ZodResponse')(target, propertyKey, descriptor);
    wrapApiResponse(schema, options)(target, propertyKey, descriptor);
  };
}
