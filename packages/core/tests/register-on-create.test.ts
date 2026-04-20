import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { registerOnCreate, ZodDto } from '../src';

describe('registerOnCreate', () => {
  it('fires for DTOs created AFTER registration', () => {
    const hook = vi.fn();
    const unsubscribe = registerOnCreate(hook);
    try {
      const Dto = ZodDto(z.object({ a: z.number() }));
      expect(hook).toHaveBeenCalledWith(Dto);
    } finally {
      unsubscribe();
    }
  });

  it('fires retroactively for DTOs created BEFORE registration', () => {
    // Create a DTO first — no hook is registered yet.
    const PreDto = ZodDto(z.object({ b: z.number() }));
    const hook = vi.fn();
    const unsubscribe = registerOnCreate(hook);
    try {
      expect(hook).toHaveBeenCalledWith(PreDto);
    } finally {
      unsubscribe();
    }
  });

  it('unsubscribe prevents future fires', () => {
    const hook = vi.fn();
    const unsubscribe = registerOnCreate(hook);
    const Before = ZodDto(z.object({ c: z.number() }));
    unsubscribe();
    const After = ZodDto(z.object({ d: z.number() }));
    expect(hook).toHaveBeenCalledWith(Before);
    expect(hook).not.toHaveBeenCalledWith(After);
  });
});
