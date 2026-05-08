import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { toDto, ZodDto, ZodDtoValidationError } from '../src';

describe('toDto', () => {
  const ItemDto = ZodDto(
    z.object({
      id: z.number(),
      label: z.string(),
    }),
  );

  it('parses valid single object and returns class instance', () => {
    const result = toDto(ItemDto, { id: 1, label: 'foo' });
    expect(result).toBeInstanceOf(ItemDto);
    expect(result).toEqual({ id: 1, label: 'foo' });
  });

  it('parses valid array via z.array(Dto) and returns array of class instances', () => {
    const results = toDto(z.array(ItemDto), [
      { id: 1, label: 'a' },
      { id: 2, label: 'b' },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0]).toBeInstanceOf(ItemDto);
    expect(results[1]).toBeInstanceOf(ItemDto);
  });

  it('throws ZodDtoValidationError on invalid single object', () => {
    expect(() => toDto(ItemDto, { id: 'not a number', label: 123 })).toThrow(ZodDtoValidationError);
  });

  it('ZodDtoValidationError contains formatted issues', () => {
    try {
      toDto(ItemDto, { id: 'bad' });
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ZodDtoValidationError);
      const validationError = error as ZodDtoValidationError;
      expect(validationError.issues).toBeInstanceOf(Array);
      expect(validationError.issues.length).toBeGreaterThan(0);
      expect(validationError.message).toContain(validationError.issues[0]);
    }
  });

  it('throws ZodDtoValidationError on invalid item in array', () => {
    expect(() =>
      toDto(z.array(ItemDto), [
        { id: 1, label: 'ok' },
        { id: 'bad', label: 'fail' },
      ]),
    ).toThrow(ZodDtoValidationError);
  });

  it('strips extra fields', () => {
    const result = toDto(ItemDto, { id: 1, label: 'foo', extra: 'bar' });
    expect(result).toEqual({ id: 1, label: 'foo' });
    expect((result as Record<string, unknown>)['extra']).toBeUndefined();
  });

  it('handles empty array via z.array(Dto)', () => {
    const results = toDto(z.array(ItemDto), []);
    expect(results).toEqual([]);
  });

  describe('toDto.with — preset preprocessor', () => {
    const snakeToCamel = (data: unknown): unknown => {
      if (typeof data !== 'object' || data === null) return data;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
        out[k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = v;
      }

      return out;
    };

    const RowDto = ZodDto(z.object({ id: z.number(), itemLabel: z.string() }));

    it('accepts a bare function as shorthand for { preprocessors: [fn] }', () => {
      const fromDb = toDto.with(snakeToCamel);
      const result = fromDb(RowDto, { id: 1, item_label: 'foo' });
      expect(result).toBeInstanceOf(RowDto);
      expect(result).toEqual({ id: 1, itemLabel: 'foo' });
    });

    it('accepts an explicit options object', () => {
      const fromDb = toDto.with({ preprocessors: [snakeToCamel] });
      expect(fromDb(RowDto, { id: 1, item_label: 'a' })).toEqual({ id: 1, itemLabel: 'a' });
    });

    it('preprocesses input once before passing to z.array(Dto) — preprocessor is whole-input, not per-element', () => {
      // Whole-array preprocessor: snake_keys → camel_keys at the top level only.
      // For per-element transformation users wrap with z.preprocess inside the schema instead.
      const stripExtras = (data: unknown): unknown => (Array.isArray(data) ? data.map(snakeToCamel) : data);
      const fromDb = toDto.with(stripExtras);
      const out = fromDb(z.array(RowDto), [
        { id: 1, item_label: 'a' },
        { id: 2, item_label: 'b' },
      ]);
      expect(out).toHaveLength(2);
      expect(out[0]).toEqual({ id: 1, itemLabel: 'a' });
      expect(out[1]).toEqual({ id: 2, itemLabel: 'b' });
    });

    it('chains preprocessors when .with() is called multiple times', () => {
      const dropNulls = (data: unknown): unknown => {
        if (typeof data !== 'object' || data === null) return data;

        return Object.fromEntries(Object.entries(data as Record<string, unknown>).filter(([, v]) => v !== null));
      };
      const fromDb = toDto.with(dropNulls).with(snakeToCamel);
      const out = fromDb(RowDto, { id: 1, item_label: 'a', other: null });
      expect(out).toEqual({ id: 1, itemLabel: 'a' });
    });

    it('does not mutate the base toDto', () => {
      const fromDb = toDto.with(snakeToCamel);
      void fromDb;
      // base toDto must still parse exact-shape input untouched
      expect(toDto(RowDto, { id: 1, itemLabel: 'plain' })).toEqual({ id: 1, itemLabel: 'plain' });
      expect(() => toDto(RowDto, { id: 1, item_label: 'snake' })).toThrow(ZodDtoValidationError);
    });

    it('accepts plain Zod schemas (not just ZodDto classes)', () => {
      const schema = z.object({ name: z.string() });
      const fromDb = toDto.with(snakeToCamel);
      expect(fromDb(schema, { name: 'Ada' })).toEqual({ name: 'Ada' });
    });
  });

  describe('toDto.with — errorClass', () => {
    class DbValidationError extends ZodDtoValidationError {
      override readonly name = 'DbValidationError';
    }

    it('throws the configured error subclass on validation failure', () => {
      const fromDb = toDto.with({ errorClass: DbValidationError });
      try {
        fromDb(ItemDto, { id: 'bad' });
        expect.unreachable('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(DbValidationError);
        expect(e).toBeInstanceOf(ZodDtoValidationError);
        expect((e as DbValidationError).issues.length).toBeGreaterThan(0);
      }
    });

    it('does not affect the base toDto', () => {
      const fromDb = toDto.with({ errorClass: DbValidationError });
      void fromDb;
      try {
        toDto(ItemDto, { id: 'bad' });
        expect.unreachable('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(ZodDtoValidationError);
        expect(e).not.toBeInstanceOf(DbValidationError);
      }
    });

    it('latest .with(errorClass) wins on chained composition', () => {
      class A extends ZodDtoValidationError {}
      class B extends ZodDtoValidationError {}
      const chained = toDto.with({ errorClass: A }).with({ errorClass: B });
      expect(() => chained(ItemDto, { id: 'bad' })).toThrow(B);
    });

    it('inline options on the call site override preset errorClass', () => {
      const fromDb = toDto.with({ errorClass: DbValidationError });
      class Inline extends ZodDtoValidationError {}
      expect(() => fromDb(ItemDto, { id: 'bad' }, { errorClass: Inline })).toThrow(Inline);
    });
  });

  describe('toDto.with — observers', () => {
    it('fires observers after a successful parse with the parsed data', () => {
      const seen: unknown[] = [];
      const traced = toDto.with({ observers: [(d) => seen.push(d)] });
      const result = traced(ItemDto, { id: 1, label: 'x' });
      expect(seen).toEqual([{ id: 1, label: 'x' }]);
      expect(result).toBeInstanceOf(ItemDto);
    });

    it('does not fire observers on validation failure', () => {
      const seen: unknown[] = [];
      const traced = toDto.with({ observers: [(d) => seen.push(d)] });
      expect(() => traced(ItemDto, { id: 'bad' })).toThrow(ZodDtoValidationError);
      expect(seen).toEqual([]);
    });

    it('observers cannot mutate the returned value (return is ignored)', () => {
      const traced = toDto.with({ observers: [() => 'IGNORED' as unknown as void] });
      const result = traced(ItemDto, { id: 1, label: 'x' });
      expect(result).toEqual({ id: 1, label: 'x' });
      expect(result).toBeInstanceOf(ItemDto);
    });

    it('chains observers in registration order', () => {
      const order: string[] = [];
      const traced = toDto.with({ observers: [() => order.push('a')] }).with({ observers: [() => order.push('b')] });
      traced(ItemDto, { id: 1, label: 'x' });
      expect(order).toEqual(['a', 'b']);
    });
  });

  describe('toDto.async — async parsing path', () => {
    const AsyncDto = ZodDto(
      z.object({
        email: z.string().refine(async (s) => s.includes('@'), { message: 'must be email' }),
      }),
    );

    it('parses through safeParseAsync when schema has async refines', async () => {
      const result = await toDto.async(AsyncDto, { email: 'a@b' });
      expect(result).toEqual({ email: 'a@b' });
    });

    it('throws ZodDtoValidationError with formatted issues on async refine failure', async () => {
      await expect(toDto.async(AsyncDto, { email: 'no-at-sign' })).rejects.toBeInstanceOf(ZodDtoValidationError);
    });

    it('respects errorClass on async failure', async () => {
      class CustomError extends ZodDtoValidationError {}
      const traced = toDto.with({ errorClass: CustomError });
      await expect(traced.async(AsyncDto, { email: 'no' })).rejects.toBeInstanceOf(CustomError);
    });

    it('observers fire after a successful async parse', async () => {
      const seen: unknown[] = [];
      const traced = toDto.with({ observers: [(v) => seen.push(v)] });
      await traced.async(AsyncDto, { email: 'a@b' });
      expect(seen).toEqual([{ email: 'a@b' }]);
    });
  });
});
