import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { isZodDtoClass, ZodDto } from '../src';

describe('ZodDto', () => {
  const UserDto = ZodDto(
    z.object({
      name: z.string(),
      age: z.number(),
    }),
  );

  it('creates a class that is recognized as ZodDtoClass', () => {
    expect(isZodDtoClass(UserDto)).toBe(true);
  });

  it('is not recognized for plain objects or functions', () => {
    expect(isZodDtoClass({})).toBe(false);
    expect(isZodDtoClass(z.object({}))).toBe(false);
    expect(isZodDtoClass(null)).toBe(false);
    expect(isZodDtoClass(class Foo {})).toBe(false);
  });

  it('preserves Zod schema parse behavior', () => {
    const result = UserDto.safeParse({ name: 'Alice', age: 30 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: 'Alice', age: 30 });
    }
  });

  it('rejects invalid data via safeParse', () => {
    const result = UserDto.safeParse({ name: 123, age: 'not a number' });
    expect(result.success).toBe(false);
  });

  it('strips unknown keys (Zod default)', () => {
    const result = UserDto.safeParse({ name: 'Alice', age: 30, extra: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ name: 'Alice', age: 30 });
    }
  });

  it('.optional() wraps the DTO and preserves isZodDtoClass on inner', () => {
    const optionalUser = UserDto.optional();
    expect(optionalUser.safeParse(undefined).success).toBe(true);
    expect(optionalUser.safeParse({ name: 'Bob', age: 25 }).success).toBe(true);
    // The unwrapped inner should still be a ZodDtoClass
    expect(isZodDtoClass(optionalUser.unwrap())).toBe(true);
  });

  it('.nullable() wraps the DTO', () => {
    const nullableUser = UserDto.nullable();
    expect(nullableUser.safeParse(null).success).toBe(true);
    expect(nullableUser.safeParse({ name: 'Bob', age: 25 }).success).toBe(true);
  });

  it('.array() wraps the DTO', () => {
    const usersArray = UserDto.array();
    const result = usersArray.safeParse([
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(2);
    }
  });

  it('can be instantiated as a class', () => {
    const instance = new UserDto();
    expect(instance).toBeInstanceOf(UserDto);
  });
});
