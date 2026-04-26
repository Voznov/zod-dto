import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { isZodDtoClass, toDto, ZodDto } from '../src';

describe('composition', () => {
  const BaseDto = ZodDto(
    z.object({
      id: z.number(),
      name: z.string(),
      role: z.enum(['admin', 'user']),
    }),
  );

  describe('.extend()', () => {
    const ExtendedDto = BaseDto.extend({ email: z.string() });

    it('creates a new ZodDtoClass', () => {
      expect(isZodDtoClass(ExtendedDto)).toBe(true);
    });

    it('includes both base and extended fields', () => {
      const result = toDto(ExtendedDto, { id: 1, name: 'Alice', role: 'admin', email: 'a@b.com' });
      expect(result).toEqual({ id: 1, name: 'Alice', role: 'admin', email: 'a@b.com' });
    });

    it('rejects data missing extended field', () => {
      expect(() => toDto(ExtendedDto, { id: 1, name: 'Alice', role: 'admin' })).toThrow();
    });
  });

  describe('.omit()', () => {
    const WithoutRoleDto = BaseDto.omit({ role: true });

    it('creates a new ZodDtoClass', () => {
      expect(isZodDtoClass(WithoutRoleDto)).toBe(true);
    });

    it('excludes omitted fields', () => {
      const result = toDto(WithoutRoleDto, { id: 1, name: 'Alice' });
      expect(result).toEqual({ id: 1, name: 'Alice' });
    });

    it('strips omitted field from input', () => {
      const result = toDto(WithoutRoleDto, { id: 1, name: 'Alice', role: 'admin' });
      expect(result).toEqual({ id: 1, name: 'Alice' });
    });
  });

  describe('.pick()', () => {
    const NameOnlyDto = BaseDto.pick({ name: true });

    it('creates a new ZodDtoClass', () => {
      expect(isZodDtoClass(NameOnlyDto)).toBe(true);
    });

    it('keeps only picked fields', () => {
      const result = toDto(NameOnlyDto, { name: 'Alice' });
      expect(result).toEqual({ name: 'Alice' });
    });

    it('strips non-picked fields from input', () => {
      const result = toDto(NameOnlyDto, { id: 1, name: 'Alice', role: 'admin' });
      expect(result).toEqual({ name: 'Alice' });
    });
  });

  describe('chained composition', () => {
    it('.extend() then .omit()', () => {
      const Dto = BaseDto.extend({ email: z.string() }).omit({ role: true });
      const result = toDto(Dto, { id: 1, name: 'Alice', email: 'a@b.com' });
      expect(result).toEqual({ id: 1, name: 'Alice', email: 'a@b.com' });
    });

    it('.pick() then .extend()', () => {
      const Dto = BaseDto.pick({ id: true }).extend({ status: z.boolean() });
      const result = toDto(Dto, { id: 1, status: true });
      expect(result).toEqual({ id: 1, status: true });
    });
  });

  describe('nested DTOs', () => {
    const AddressDto = ZodDto(
      z.object({
        city: z.string(),
        zip: z.string(),
      }),
    );

    const PersonDto = ZodDto(
      z.object({
        name: z.string(),
        address: AddressDto,
      }),
    );

    it('validates nested DTO', () => {
      const result = toDto(PersonDto, { name: 'Alice', address: { city: 'NYC', zip: '10001' } });
      expect(result).toEqual({ name: 'Alice', address: { city: 'NYC', zip: '10001' } });
    });

    it('rejects invalid nested data', () => {
      expect(() => toDto(PersonDto, { name: 'Alice', address: { city: 123 } })).toThrow();
    });

    it('validates array of nested DTOs', () => {
      const TeamDto = ZodDto(
        z.object({
          members: AddressDto.array(),
        }),
      );
      const result = toDto(TeamDto, {
        members: [
          { city: 'NYC', zip: '10001' },
          { city: 'LA', zip: '90001' },
        ],
      });
      expect(result.members).toHaveLength(2);
    });
  });

  // Regression: ZodDto wrapping an already-DTO chain used to hang tsc on chained
  // derivations because TS tried to unify ZodDtoClass<...> against z.ZodObject<T>
  // to infer T. The first ZodDto overload now accepts ZodDtoClass directly and
  // returns it as-is; the runtime guard mirrors the type-level passthrough.
  describe('idempotent ZodDto(dto)', () => {
    const Base = ZodDto(z.object({ a: z.string(), b: z.number(), c: z.boolean() }));

    it('returns the same class reference when input is already a DTO', () => {
      expect(ZodDto(Base)).toBe(Base);
    });

    it('chained derivations re-wrapped in ZodDto compile and parse correctly', () => {
      class Derived extends ZodDto(Base.omit({ c: true }).extend({ d: z.string() })) {}
      class Deeper extends ZodDto(Derived.extend({ e: z.string() })) {}

      const d = toDto(Derived, { a: 'x', b: 1, d: 'y' });
      expect(d).toBeInstanceOf(Derived);
      expect(d).toEqual({ a: 'x', b: 1, d: 'y' });

      const e = toDto(Deeper, { a: 'x', b: 1, d: 'y', e: 'z' });
      expect(e).toBeInstanceOf(Deeper);
      expect(e).toEqual({ a: 'x', b: 1, d: 'y', e: 'z' });
    });

    it('subclassing a re-wrapped chain still produces subclass instances', () => {
      class Wrapped extends ZodDto(Base.omit({ c: true })) {
        labelled() {
          return `${this.a}/${this.b}`;
        }
      }

      const w = toDto(Wrapped, { a: 'x', b: 7 });
      expect(w).toBeInstanceOf(Wrapped);
      expect(w.labelled()).toBe('x/7');
    });
  });
});
