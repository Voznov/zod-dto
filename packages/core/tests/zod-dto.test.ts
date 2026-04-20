import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { isZodDtoClass, toDto, ZodDto } from '../src';

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

  it('parsed result is an instance of the DTO class', () => {
    const result = UserDto.safeParse({ name: 'Alice', age: 30 });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBeInstanceOf(UserDto);
  });

  describe('extending ZodDto(...)', () => {
    class MyPoint extends ZodDto(z.object({ x: z.number(), y: z.number() })) {
      label() {
        return `(${this.x}, ${this.y})`;
      }
    }

    it('new MyPoint() is instanceof the subclass', () => {
      const instance = new MyPoint();
      expect(instance).toBeInstanceOf(MyPoint);
    });

    it('toDto returns an instance of the subclass with its methods accessible', () => {
      const p = toDto(MyPoint, { x: 3, y: 4 });
      expect(p).toBeInstanceOf(MyPoint);
      expect(p.label()).toBe('(3, 4)');
    });

    it('direct safeParse on the subclass returns an instance of the subclass', () => {
      const parsed = MyPoint.safeParse({ x: 1, y: 2 });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data).toBeInstanceOf(MyPoint);
        // Runtime is a MyPoint; Zod's inferred type is plain {x,y}, so cast to reach .label().
        expect((parsed.data as InstanceType<typeof MyPoint>).label()).toBe('(1, 2)');
      }
    });

    // Inferred types don't carry subclass methods through nested schemas (Zod infers the
    // ZodObject shape, not the user-level class) — cast to call `.label()`. Runtime does
    // preserve the prototype via the walker.

    it('subclass is preserved inside z.array(MyPoint)', () => {
      const List = ZodDto(z.object({ points: z.array(MyPoint) }));
      const result = toDto(List, {
        points: [
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ],
      });
      expect(result.points[0]).toBeInstanceOf(MyPoint);
      expect((result.points[1] as InstanceType<typeof MyPoint>).label()).toBe('(3, 4)');
    });

    it('subclass is preserved inside a nested DTO field', () => {
      const Shape = ZodDto(z.object({ origin: MyPoint, tag: z.string() }));
      const result = toDto(Shape, { origin: { x: 7, y: 8 }, tag: 'hello' });
      expect(result.origin).toBeInstanceOf(MyPoint);
      expect((result.origin as InstanceType<typeof MyPoint>).label()).toBe('(7, 8)');
    });

    it('subclass is preserved inside a discriminated union option', () => {
      const TaggedPoint = ZodDto(z.object({ kind: z.literal('p'), point: MyPoint }));
      const Other = ZodDto(z.object({ kind: z.literal('o'), value: z.string() }));
      const Wrap = ZodDto(z.object({ item: z.discriminatedUnion('kind', [TaggedPoint, Other]) }));
      const result = toDto(Wrap, { item: { kind: 'p', point: { x: 5, y: 6 } } });
      const item = result.item as InstanceType<typeof TaggedPoint>;
      expect(item.point).toBeInstanceOf(MyPoint);
      expect((item.point as InstanceType<typeof MyPoint>).label()).toBe('(5, 6)');
    });

    describe('opt-in self-ref via ZodDto<MyPoint>()(...) — no casts needed', () => {
      class SelfTypedPoint extends ZodDto<SelfTypedPoint>()(z.object({ x: z.number(), y: z.number() })) {
        label() {
          return `(${this.x}, ${this.y})`;
        }
      }

      it('z.infer<typeof X> propagates subclass methods into nested positions', () => {
        const List = ZodDto(z.object({ points: z.array(SelfTypedPoint) }));
        const result = toDto(List, {
          points: [
            { x: 1, y: 2 },
            { x: 3, y: 4 },
          ],
        });
        // No casts: runtime + types agree that elements are SelfTypedPoint instances.
        expect(result.points[0].label()).toBe('(1, 2)');
        expect(result.points[1].label()).toBe('(3, 4)');
      });

      it('propagates into a nested DTO field without casts', () => {
        const Shape = ZodDto(z.object({ origin: SelfTypedPoint, tag: z.string() }));
        const result = toDto(Shape, { origin: { x: 7, y: 8 }, tag: 'hello' });
        expect(result.origin.label()).toBe('(7, 8)');
      });
    });
  });
});
