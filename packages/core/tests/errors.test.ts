import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { formatZodIssues, ZodDtoValidationError } from '../src';

describe('formatZodIssues', () => {
  it('formats root-level error without path', () => {
    const result = z.string().safeParse(123);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = formatZodIssues(result.error.issues);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toBe(result.error.issues[0].message);
    }
  });

  it('formats nested path with dot notation', () => {
    const schema = z.object({ user: z.object({ name: z.string() }) });
    const result = schema.safeParse({ user: { name: 123 } });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = formatZodIssues(result.error.issues);
      expect(messages[0]).toMatch(/^user\.name:/);
    }
  });

  it('formats array index with bracket notation', () => {
    const schema = z.object({ items: z.array(z.string()) });
    const result = schema.safeParse({ items: ['ok', 123] });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = formatZodIssues(result.error.issues);
      expect(messages[0]).toMatch(/^items\[1\]:/);
    }
  });

  it('formats deeply nested path', () => {
    const schema = z.object({
      a: z.object({
        b: z.array(z.object({ c: z.number() })),
      }),
    });
    const result = schema.safeParse({ a: { b: [{ c: 'bad' }] } });
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = formatZodIssues(result.error.issues);
      expect(messages[0]).toMatch(/^a\.b\[0\]\.c:/);
    }
  });
});

describe('ZodDtoValidationError', () => {
  it('extends Error', () => {
    const error = new ZodDtoValidationError(['field: invalid']);
    expect(error).toBeInstanceOf(Error);
  });

  it('has correct name', () => {
    const error = new ZodDtoValidationError(['field: invalid']);
    expect(error.name).toBe('ZodDtoValidationError');
  });

  it('joins issues into message', () => {
    const error = new ZodDtoValidationError(['a: bad', 'b: wrong']);
    expect(error.message).toBe('a: bad; b: wrong');
  });

  it('exposes issues array', () => {
    const issues = ['x: required', 'y: too short'];
    const error = new ZodDtoValidationError(issues);
    expect(error.issues).toEqual(issues);
  });
});
