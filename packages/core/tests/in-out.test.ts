import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { aliases } from './aliases';
import { toDto, ZodDto } from '../src';

describe('in hook', () => {
  it('applies via toDto and via direct safeParse (nested DTOs)', () => {
    const Inner = ZodDto(z.object({ userId: z.number() }), {
      in: aliases({ user_id: 'userId' }),
    });
    const Outer = ZodDto(z.object({ owner: Inner }));

    // toDto on outer applies inner's `in` because the preprocess is schema-embedded.
    const result = toDto(Outer, { owner: { user_id: 42 } });
    expect(result).toEqual({ owner: { userId: 42 } });

    // Direct safeParse on inner also applies `in`.
    const parsed = Inner.safeParse({ user_id: 7 });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual({ userId: 7 });
  });

  it('does NOT inherit to derived DTOs via .extend()/.pick()/.omit()', () => {
    const Base = ZodDto(z.object({ userId: z.number(), firstName: z.string() }), {
      in: aliases({ user_id: 'userId', first_name: 'firstName' }),
    });

    // Derived DTOs receive raw (camelCase) data only; the `in` hook is not forwarded.
    expect(toDto(Base.extend({ email: z.string() }), { userId: 1, firstName: 'A', email: 'a@b.com' })).toEqual({
      userId: 1,
      firstName: 'A',
      email: 'a@b.com',
    });
    expect(toDto(Base.pick({ userId: true }), { userId: 9 })).toEqual({ userId: 9 });

    // Passing snake_case to a derived DTO fails — no alias normalization.
    expect(() => toDto(Base.pick({ userId: true }), { user_id: 9 })).toThrow();
  });
});

describe('out hook', () => {
  const UserDto = ZodDto(
    z.object({
      firstName: z.string(),
      lastName: z.string(),
      password: z.string(),
    }),
    {
      out: (parsed) => ({
        fullName: `${parsed.firstName} ${parsed.lastName}`,
        // strip password on serialization
      }),
    },
  );

  it('toJSON returns the transformed payload', () => {
    const dto = toDto(UserDto, { firstName: 'Ada', lastName: 'Lovelace', password: 'secret' });
    expect((dto as unknown as { toJSON: () => unknown }).toJSON()).toEqual({ fullName: 'Ada Lovelace' });
  });

  it('JSON.stringify picks up toJSON automatically', () => {
    const dto = toDto(UserDto, { firstName: 'Ada', lastName: 'Lovelace', password: 'secret' });
    expect(JSON.parse(JSON.stringify(dto))).toEqual({ fullName: 'Ada Lovelace' });
  });

  it('nested DTO serializes through its own out', () => {
    const Inner = ZodDto(z.object({ a: z.number(), b: z.number() }), {
      out: (parsed) => ({ sum: parsed.a + parsed.b }),
    });
    const Outer = ZodDto(z.object({ inner: Inner, label: z.string() }));

    const dto = toDto(Outer, { inner: { a: 2, b: 3 }, label: 'x' });
    expect(JSON.parse(JSON.stringify(dto))).toEqual({ inner: { sum: 5 }, label: 'x' });
  });

  it('instance retains original parsed shape (out affects only serialization)', () => {
    const dto = toDto(UserDto, { firstName: 'Ada', lastName: 'Lovelace', password: 'secret' });
    expect(dto.firstName).toBe('Ada');
    expect(dto.password).toBe('secret');
  });
});
