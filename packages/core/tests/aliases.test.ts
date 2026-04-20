import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { aliases } from './aliases';
import { toDto, ZodDto } from '../src';

describe('aliases helper', () => {
  const UserEntity = ZodDto(
    z.object({
      userId: z.number(),
      firstName: z.string(),
      isActive: z.boolean(),
    }),
    {
      in: aliases({
        user_id: 'userId',
        first_name: 'firstName',
        is_active: 'isActive',
      }),
    },
  );

  it('maps aliased (snake_case) keys to camelCase', () => {
    const result = toDto(UserEntity, { user_id: 1, first_name: 'Alice', is_active: true });
    expect(result).toEqual({ userId: 1, firstName: 'Alice', isActive: true });
  });

  it('accepts camelCase keys directly', () => {
    const result = toDto(UserEntity, { userId: 1, firstName: 'Alice', isActive: true });
    expect(result).toEqual({ userId: 1, firstName: 'Alice', isActive: true });
  });

  it('does not overwrite existing camelCase key with alias', () => {
    const result = toDto(UserEntity, { userId: 42, user_id: 99, firstName: 'Bob', isActive: false });
    expect(result.userId).toBe(42);
  });

  it('rejects invalid data even with aliases', () => {
    expect(() => toDto(UserEntity, { user_id: 'not a number', first_name: 123, is_active: 'yes' })).toThrow();
  });
});
