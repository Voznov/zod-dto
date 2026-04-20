import { ApiExtraModels, ApiProperty, type ApiPropertyOptions, refs } from '@nestjs/swagger';
import { type SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { isZodDtoClass, type ZodDtoClass } from '@voznov/zod-dto';
import { z } from 'zod';
import { mapValues } from './utils';

const schemaObjectToApiPropertyOptions = (so: SchemaObject, selfRequired: boolean): ApiPropertyOptions => {
  if ('oneOf' in so || 'anyOf' in so || 'allOf' in so) {
    return { ...so, type: Array, required: selfRequired };
  }

  return { ...so, required: selfRequired } as ApiPropertyOptions;
};

const leaf = (so: SchemaObject): { so: SchemaObject; selfRequired: boolean; innerSchemas: Set<ZodDtoClass> } => ({
  so,
  selfRequired: true,
  innerSchemas: new Set(),
});

const decoratedDtoClasses = new Set<ZodDtoClass>();

export const applySwaggerDecorators = (schema: z.core.$ZodType): { so: SchemaObject; selfRequired: boolean; innerSchemas: Set<ZodDtoClass> } => {
  // --- Objects ---

  if (schema instanceof z.ZodObject) {
    if (isZodDtoClass(schema) && decoratedDtoClasses.has(schema)) {
      return { so: { oneOf: refs(schema) }, selfRequired: true, innerSchemas: new Set([schema]) };
    }

    const properties: Record<string, SchemaObject> = {};
    const required: string[] = [];
    const innerSchemas = new Set<ZodDtoClass>();
    Object.entries(schema.shape).forEach(([key, fieldSchema]) => {
      const { so, selfRequired, innerSchemas: innerSchemas_ } = applySwaggerDecorators(fieldSchema as z.ZodType);
      properties[key] = so;
      innerSchemas_.forEach((innerSchema) => innerSchemas.add(innerSchema));
      if (selfRequired) {
        required.push(key);
      }
    });

    if (isZodDtoClass(schema)) {
      decoratedDtoClasses.add(schema);
      for (const [key, propertySo] of Object.entries(properties)) {
        ApiProperty(schemaObjectToApiPropertyOptions(propertySo, required.includes(key)))(schema.prototype, key);
      }
      ApiExtraModels(...[...innerSchemas.values()].filter((innerSchema) => innerSchema !== schema))(schema);

      return { so: { oneOf: refs(schema) }, selfRequired: true, innerSchemas: new Set([schema]) };
    }

    return { so: { type: 'object', properties: mapValues(properties, (so) => (so.oneOf?.length === 1 ? so.oneOf[0] : so)), required }, selfRequired: true, innerSchemas };
  }

  if (schema instanceof z.ZodRecord) {
    const { so } = applySwaggerDecorators(schema._zod.def.valueType as z.ZodType);

    return leaf({ type: 'object', additionalProperties: so.oneOf?.length === 1 ? so.oneOf[0] : so });
  }

  // --- Wrappers (unwrap to inner type) ---

  if (schema instanceof z.ZodOptional || schema instanceof z.ZodExactOptional) {
    return { ...applySwaggerDecorators(schema.unwrap()), selfRequired: false };
  }

  if (schema instanceof z.ZodDefault) {
    return { ...applySwaggerDecorators(schema.unwrap()), selfRequired: false };
  }

  if (schema instanceof z.ZodReadonly || schema instanceof z.ZodLazy || schema instanceof z.ZodCatch) {
    return applySwaggerDecorators(schema.unwrap());
  }

  if (schema instanceof z.ZodNonOptional) {
    return { ...applySwaggerDecorators(schema.unwrap()), selfRequired: true };
  }

  if (schema instanceof z.ZodNullable) {
    const result = applySwaggerDecorators(schema.unwrap());

    return { ...result, so: { ...result.so, nullable: true } };
  }

  if (schema instanceof z.ZodPipe) {
    // z.preprocess() creates a Pipe(in: ZodTransform, out: schema).
    // For swagger, skip the transform and process the output schema directly.
    const inner = schema.in instanceof z.ZodTransform ? schema.out : schema.in;

    return applySwaggerDecorators(inner);
  }

  if (schema instanceof z.ZodTransform) {
    return leaf({});
  }

  // --- Arrays & tuples ---

  if (schema instanceof z.ZodArray) {
    const element = schema.unwrap();
    const { so, selfRequired: selfRequiredElement, innerSchemas } = applySwaggerDecorators(element);
    if (!selfRequiredElement) {
      throw new Error('Not required array item is not supported in Swagger. Use nullable instead.');
    }

    return { so: { type: 'array', items: so.oneOf?.length === 1 ? so.oneOf[0] : so }, selfRequired: true, innerSchemas };
  }

  if (schema instanceof z.ZodTuple) {
    const itemSchemas = schema._zod.def.items.map((item) => {
      const { so } = applySwaggerDecorators(item);

      return so.oneOf?.length === 1 ? so.oneOf[0] : so;
    });

    // Deduplicate by JSON representation to collapse identical types
    const unique = [...new Map(itemSchemas.map((s) => [JSON.stringify(s), s])).values()];
    const items = unique.length === 1 ? unique[0] : { oneOf: unique };

    return leaf({ type: 'array', items, minItems: itemSchemas.length, maxItems: itemSchemas.length });
  }

  // --- Scalars ---

  // ZodString: plain z.string(). ZodStringFormat: z.email(), z.uuid(), z.url(), z.ipv4(), etc.
  // Both share the same properties (minLength, maxLength, format).
  if (schema instanceof z.ZodString || schema instanceof z.ZodStringFormat) {
    const so: SchemaObject = { type: 'string' };
    if (schema.minLength !== null) so.minLength = schema.minLength;
    if (schema.maxLength !== null) so.maxLength = schema.maxLength;
    const fmt = schema.format;
    if (fmt !== null) {
      if (fmt === 'regex') {
        // Grab the first regex pattern from the internal bag.
        const patterns = schema._zod.bag.patterns;
        const first = patterns ? [...patterns][0] : undefined;
        if (first) so.pattern = first.source;
      } else {
        so.format = fmt;
      }
    }

    return { so, selfRequired: true, innerSchemas: new Set() };
  }

  // Number and integer subtypes (ZodInt, ZodNumberFormat, etc.) — all instanceof ZodNumber.
  if (schema instanceof z.ZodNumber) {
    const fmt = schema.format;
    const isInt = fmt === 'int32' || fmt === 'uint32' || fmt === 'safeint';
    const so: SchemaObject = { type: isInt ? 'integer' : 'number' };
    if (schema.minValue !== null && schema.minValue !== Number.MIN_SAFE_INTEGER && Number.isFinite(schema.minValue)) so.minimum = schema.minValue;
    if (schema.maxValue !== null && schema.maxValue !== Number.MAX_SAFE_INTEGER && Number.isFinite(schema.maxValue)) so.maximum = schema.maxValue;

    return { so, selfRequired: true, innerSchemas: new Set() };
  }

  if (schema instanceof z.ZodBigInt) {
    return leaf({ type: 'integer', format: 'int64' });
  }

  if (schema instanceof z.ZodBoolean) {
    return leaf({ type: 'boolean' });
  }

  if (schema instanceof z.ZodDate) {
    return leaf({ type: 'string', format: 'date-time' });
  }

  if (schema instanceof z.ZodNull) {
    return { so: { nullable: true }, selfRequired: true, innerSchemas: new Set() };
  }

  // --- Enums & literals ---

  if (schema instanceof z.ZodEnum) {
    return leaf({ enum: schema.options });
  }

  if (schema instanceof z.ZodLiteral) {
    return leaf({ enum: [...schema.values] });
  }

  // --- Unions & intersections ---

  if (schema instanceof z.ZodUnion || schema instanceof z.ZodDiscriminatedUnion) {
    const innerSchemas = new Set<ZodDtoClass>();
    const oneOf = schema.options.map((option) => {
      const { so, selfRequired, innerSchemas: innerSchemas_ } = applySwaggerDecorators(option);

      if (!selfRequired) {
        throw new Error('Not required option in oneOf is not supported in Swagger. Use nullable instead.');
      }

      innerSchemas_.forEach((innerSchema) => innerSchemas.add(innerSchema));

      // Flatten { oneOf: [single_ref] } → just the ref, so union of DTO refs stays clean.
      return so.oneOf?.length === 1 ? so.oneOf[0] : so;
    });

    return { so: { oneOf }, selfRequired: true, innerSchemas };
  }

  if (schema instanceof z.ZodIntersection) {
    const left = applySwaggerDecorators(schema._zod.def.left as z.ZodType);
    const right = applySwaggerDecorators(schema._zod.def.right as z.ZodType);
    const innerSchemas = new Set([...left.innerSchemas, ...right.innerSchemas]);
    const leftSo = left.so.oneOf?.length === 1 ? left.so.oneOf[0] : left.so;
    const rightSo = right.so.oneOf?.length === 1 ? right.so.oneOf[0] : right.so;

    return { so: { allOf: [leftSo, rightSo] }, selfRequired: true, innerSchemas };
  }

  // --- Catch-all ---

  if (schema instanceof z.ZodAny || schema instanceof z.ZodUnknown) {
    return leaf({});
  }

  if (schema instanceof z.ZodUndefined || schema instanceof z.ZodVoid || schema instanceof z.ZodNever) {
    throw new Error(`applySwaggerDecorators: ${(schema as z.ZodType).def.type} cannot be represented in JSON`);
  }

  throw new Error(`applySwaggerDecorators: unsupported Zod type "${(schema as z.ZodType).def.type}"`);
};
