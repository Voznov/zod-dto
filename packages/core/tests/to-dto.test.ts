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

  it('parses valid array and returns array of class instances', () => {
    const results = toDto(ItemDto, [
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
      toDto(ItemDto, [
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

  it('handles empty array', () => {
    const results = toDto(ItemDto, []);
    expect(results).toEqual([]);
  });
});
