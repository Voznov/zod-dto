import { ZodDto } from '@voznov/zod-dto';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { applySwaggerDecorators } from '../src/swagger';

describe('applySwaggerDecorators', () => {
  describe('scalars', () => {
    it('string', () => {
      const { so, selfRequired } = applySwaggerDecorators(z.string());
      expect(so).toEqual({ type: 'string' });
      expect(selfRequired).toBe(true);
    });

    it('string with min/max length', () => {
      const { so } = applySwaggerDecorators(z.string().min(1).max(100));
      expect(so).toEqual({ type: 'string', minLength: 1, maxLength: 100 });
    });

    it('email format', () => {
      const { so } = applySwaggerDecorators(z.email());
      expect(so).toMatchObject({ type: 'string', format: 'email' });
    });

    it('uuid format', () => {
      const { so } = applySwaggerDecorators(z.uuid());
      expect(so).toMatchObject({ type: 'string', format: 'uuid' });
    });

    it('number', () => {
      const { so } = applySwaggerDecorators(z.number());
      expect(so).toEqual({ type: 'number' });
    });

    it('integer', () => {
      const { so } = applySwaggerDecorators(z.int());
      expect(so).toMatchObject({ type: 'integer' });
    });

    it('number with min/max', () => {
      const { so } = applySwaggerDecorators(z.number().min(0).max(100));
      expect(so).toMatchObject({ type: 'number', minimum: 0, maximum: 100 });
    });

    it('boolean', () => {
      const { so } = applySwaggerDecorators(z.boolean());
      expect(so).toEqual({ type: 'boolean' });
    });

    it('bigint', () => {
      const { so } = applySwaggerDecorators(z.bigint());
      expect(so).toEqual({ type: 'integer', format: 'int64' });
    });

    it('date', () => {
      const { so } = applySwaggerDecorators(z.date());
      expect(so).toEqual({ type: 'string', format: 'date-time' });
    });
  });

  describe('enums & literals', () => {
    it('enum', () => {
      const { so } = applySwaggerDecorators(z.enum(['A', 'B', 'C']));
      expect(so).toEqual({ enum: ['A', 'B', 'C'] });
    });

    it('literal', () => {
      const { so } = applySwaggerDecorators(z.literal('active'));
      expect(so).toEqual({ enum: ['active'] });
    });
  });

  describe('objects', () => {
    it('plain object (not DTO)', () => {
      const { so } = applySwaggerDecorators(z.object({ name: z.string(), age: z.number() }));
      expect(so.type).toBe('object');
      expect(so.properties).toBeDefined();
      expect(so.properties!['name']).toEqual({ type: 'string' });
      expect(so.properties!['age']).toEqual({ type: 'number' });
      expect(so.required).toEqual(['name', 'age']);
    });

    it('object with optional field', () => {
      const { so } = applySwaggerDecorators(z.object({ name: z.string(), email: z.string().optional() }));
      expect(so.required).toEqual(['name']);
    });

    it('record', () => {
      const { so } = applySwaggerDecorators(z.record(z.string(), z.number()));
      expect(so).toEqual({ type: 'object', additionalProperties: { type: 'number' } });
    });
  });

  describe('arrays & tuples', () => {
    it('array of strings', () => {
      const { so } = applySwaggerDecorators(z.array(z.string()));
      expect(so).toEqual({ type: 'array', items: { type: 'string' } });
    });

    it('array of objects', () => {
      const { so } = applySwaggerDecorators(z.array(z.object({ id: z.number() })));
      expect(so.type).toBe('array');
      expect(so.items).toMatchObject({ type: 'object' });
    });

    it('tuple of same types', () => {
      const { so } = applySwaggerDecorators(z.tuple([z.string(), z.string()]));
      expect(so).toMatchObject({ type: 'array', minItems: 2, maxItems: 2 });
    });

    it('tuple of different types', () => {
      const { so } = applySwaggerDecorators(z.tuple([z.string(), z.number()]));
      expect(so).toMatchObject({
        type: 'array',
        items: { oneOf: [{ type: 'string' }, { type: 'number' }] },
        minItems: 2,
        maxItems: 2,
      });
    });
  });

  describe('wrappers', () => {
    it('optional marks selfRequired as false', () => {
      const { selfRequired } = applySwaggerDecorators(z.string().optional());
      expect(selfRequired).toBe(false);
    });

    it('nullable adds nullable: true', () => {
      const { so } = applySwaggerDecorators(z.string().nullable());
      expect(so).toEqual({ type: 'string', nullable: true });
    });

    it('default marks selfRequired as false', () => {
      const { selfRequired } = applySwaggerDecorators(z.string().default('hello'));
      expect(selfRequired).toBe(false);
    });

    it('null schema', () => {
      const { so } = applySwaggerDecorators(z.null());
      expect(so).toEqual({ nullable: true });
    });
  });

  describe('unions & intersections', () => {
    it('union of scalars', () => {
      const { so } = applySwaggerDecorators(z.union([z.string(), z.number()]));
      expect(so).toEqual({ oneOf: [{ type: 'string' }, { type: 'number' }] });
    });

    it('intersection produces allOf', () => {
      const { so } = applySwaggerDecorators(z.intersection(z.object({ a: z.string() }), z.object({ b: z.number() })));
      expect(so.allOf).toHaveLength(2);
    });
  });

  describe('DTO class decoration', () => {
    it('decorates DTO class and returns $ref-style schema', () => {
      const TestDto = ZodDto(z.object({ value: z.string() }));
      const { so, innerSchemas } = applySwaggerDecorators(TestDto);
      expect(so.oneOf).toBeDefined();
      expect(innerSchemas.has(TestDto)).toBe(true);
    });

    it('handles nested DTO references', () => {
      const InnerDto = ZodDto(z.object({ x: z.number() }));
      const OuterDto = ZodDto(z.object({ inner: InnerDto }));
      const { innerSchemas } = applySwaggerDecorators(OuterDto);
      expect(innerSchemas.has(OuterDto)).toBe(true);
    });
  });

  describe('unsupported types', () => {
    it('throws on undefined', () => {
      expect(() => applySwaggerDecorators(z.undefined())).toThrow('cannot be represented in JSON');
    });

    it('throws on void', () => {
      expect(() => applySwaggerDecorators(z.void())).toThrow('cannot be represented in JSON');
    });

    it('handles z.any()', () => {
      const { so } = applySwaggerDecorators(z.any());
      expect(so).toEqual({});
    });

    it('handles z.unknown()', () => {
      const { so } = applySwaggerDecorators(z.unknown());
      expect(so).toEqual({});
    });
  });
});
