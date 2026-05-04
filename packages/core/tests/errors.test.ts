import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { formatZodIssues, toDto, ZodDto, ZodDtoValidationError } from '../src';

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

  it('formats numeric path segment in first position with brackets', () => {
    const messages = formatZodIssues([{ code: 'custom', path: [1, 'id'], message: 'Invalid UUID' } as unknown as z.core.$ZodIssue]);
    expect(messages[0]).toBe('[1].id: Invalid UUID');
  });
});

describe('toDto path prefixing', () => {
  class UserDto extends ZodDto(
    z.object({
      id: z.uuid(),
      email: z.email(),
    }),
  ) {}

  it('prefixes the element index when schema is z.array(Dto)', () => {
    try {
      toDto(z.array(UserDto), [
        { id: '00000000-0000-4000-8000-000000000000', email: 'ok@example.com' },
        { id: 'broken', email: 'broken' },
      ]);
      expect.fail('expected toDto to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ZodDtoValidationError);
      const issues = (e as ZodDtoValidationError).issues;
      expect(issues.every((i) => i.startsWith('[1].'))).toBe(true);
      expect(issues).toEqual(expect.arrayContaining([expect.stringMatching(/^\[1\]\.id:/), expect.stringMatching(/^\[1\]\.email:/)]));
    }
  });

  it('does NOT prefix index when input is a single object', () => {
    try {
      toDto(UserDto, { id: 'broken', email: 'broken' });
      expect.fail('expected toDto to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ZodDtoValidationError);
      const issues = (e as ZodDtoValidationError).issues;
      expect(issues.some((i) => i.startsWith('id:'))).toBe(true);
      expect(issues.some((i) => i.startsWith('['))).toBe(false);
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

  it('summarizes a single issue with its full text', () => {
    const error = new ZodDtoValidationError(['a: bad']);
    expect(error.message).toBe('1 issue: "a: bad"');
  });

  it('summarizes many issues with the first + remainder count', () => {
    const error = new ZodDtoValidationError(['a: bad', 'b: wrong', 'c: missing']);
    expect(error.message).toBe('3 issues: "a: bad" (+2 more)');
  });

  it('summarizes empty list as "0 issues" (edge)', () => {
    const error = new ZodDtoValidationError([]);
    expect(error.message).toBe('0 issues');
  });

  it('exposes issues array', () => {
    const issues = ['x: required', 'y: too short'];
    const error = new ZodDtoValidationError(issues);
    expect(error.issues).toEqual(issues);
  });
});
