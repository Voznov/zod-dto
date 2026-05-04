import { getSchemaPath } from '@nestjs/swagger';
import { lazyDto, registerOnCreate, ZodDto } from '@voznov/zod-dto';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { applySwaggerDecorators } from '../src/swagger';

describe('applySwaggerDecorators', () => {
  describe('scalars', () => {
    it('string', () => {
      const { so, selfRequired } = applySwaggerDecorators(z.string());
      expect(so).toEqual({ type: 'string' });
      expect(selfRequired).toBe(true);
    });

    it('string with min/max length', () => {
      const { so } = applySwaggerDecorators(z.string().min(1).max(100));
      expect(so).toEqual({ type: 'string', minLength: 1, maxLength: 100 });
    });

    it('email format', () => {
      const { so } = applySwaggerDecorators(z.email());
      expect(so).toMatchObject({ type: 'string', format: 'email' });
    });

    it('uuid format', () => {
      const { so } = applySwaggerDecorators(z.uuid());
      expect(so).toMatchObject({ type: 'string', format: 'uuid' });
    });

    it('number', () => {
      const { so } = applySwaggerDecorators(z.number());
      expect(so).toEqual({ type: 'number' });
    });

    it('integer', () => {
      const { so } = applySwaggerDecorators(z.int());
      expect(so).toMatchObject({ type: 'integer' });
    });

    it('number with min/max', () => {
      const { so } = applySwaggerDecorators(z.number().min(0).max(100));
      expect(so).toMatchObject({ type: 'number', minimum: 0, maximum: 100 });
    });

    it('boolean', () => {
      const { so } = applySwaggerDecorators(z.boolean());
      expect(so).toEqual({ type: 'boolean' });
    });

    it('bigint', () => {
      const { so } = applySwaggerDecorators(z.bigint());
      expect(so).toEqual({ type: 'integer', format: 'int64' });
    });

    it('date', () => {
      const { so } = applySwaggerDecorators(z.date());
      expect(so).toEqual({ type: 'string', format: 'date-time' });
    });

    it('z.iso.datetime() emits OpenAPI-standard date-time, not Zod-internal datetime', () => {
      const { so } = applySwaggerDecorators(z.iso.datetime());
      expect(so).toMatchObject({ type: 'string', format: 'date-time' });
    });

    it('z.iso.date() / z.iso.time() pass through unchanged (already standard)', () => {
      expect(applySwaggerDecorators(z.iso.date()).so).toMatchObject({ type: 'string', format: 'date' });
      expect(applySwaggerDecorators(z.iso.time()).so).toMatchObject({ type: 'string', format: 'time' });
    });
  });

  describe('enums & literals', () => {
    it('enum', () => {
      const { so } = applySwaggerDecorators(z.enum(['A', 'B', 'C']));
      expect(so).toEqual({ enum: ['A', 'B', 'C'] });
    });

    it('literal', () => {
      const { so } = applySwaggerDecorators(z.literal('active'));
      expect(so).toEqual({ enum: ['active'] });
    });
  });

  describe('objects', () => {
    it('plain object (not DTO)', () => {
      const { so } = applySwaggerDecorators(z.object({ name: z.string(), age: z.number() }));
      expect(so.type).toBe('object');
      expect(so.properties).toBeDefined();
      expect(so.properties!['name']).toEqual({ type: 'string' });
      expect(so.properties!['age']).toEqual({ type: 'number' });
      expect(so.required).toEqual(['name', 'age']);
    });

    it('object with optional field', () => {
      const { so } = applySwaggerDecorators(z.object({ name: z.string(), email: z.string().optional() }));
      expect(so.required).toEqual(['name']);
    });

    it('record', () => {
      const { so } = applySwaggerDecorators(z.record(z.string(), z.number()));
      expect(so).toEqual({ type: 'object', additionalProperties: { type: 'number' } });
    });
  });

  describe('arrays & tuples', () => {
    it('array of strings', () => {
      const { so } = applySwaggerDecorators(z.array(z.string()));
      expect(so).toEqual({ type: 'array', items: { type: 'string' } });
    });

    it('array of objects', () => {
      const { so } = applySwaggerDecorators(z.array(z.object({ id: z.number() })));
      expect(so.type).toBe('array');
      expect(so.items).toMatchObject({ type: 'object' });
    });

    it('tuple of same types', () => {
      const { so } = applySwaggerDecorators(z.tuple([z.string(), z.string()]));
      expect(so).toMatchObject({ type: 'array', minItems: 2, maxItems: 2 });
    });

    it('tuple of different types', () => {
      const { so } = applySwaggerDecorators(z.tuple([z.string(), z.number()]));
      expect(so).toMatchObject({
        type: 'array',
        items: { oneOf: [{ type: 'string' }, { type: 'number' }] },
        minItems: 2,
        maxItems: 2,
      });
    });
  });

  describe('describe()', () => {
    it('forwards .describe() text into OpenAPI description', () => {
      const { so } = applySwaggerDecorators(z.string().describe('Primary contact'));
      expect(so).toMatchObject({ type: 'string', description: 'Primary contact' });
    });

    it('describe() on inner of optional propagates', () => {
      const { so, selfRequired } = applySwaggerDecorators(z.string().describe('Primary contact').optional());
      expect(selfRequired).toBe(false);
      expect(so).toMatchObject({ type: 'string', description: 'Primary contact' });
    });

    it('describe() on the wrapper (optional) is also picked up', () => {
      const { so, selfRequired } = applySwaggerDecorators(z.string().optional().describe('Primary contact'));
      expect(selfRequired).toBe(false);
      expect(so).toMatchObject({ type: 'string', description: 'Primary contact' });
    });

    it('describe() on a DTO field lands in @ApiProperty metadata', () => {
      class UserDto extends ZodDto(z.object({ email: z.email().describe('Login email') })) {}
      applySwaggerDecorators(UserDto);
      const meta = Reflect.getMetadata('swagger/apiModelProperties', UserDto.prototype, 'email') as { description?: string };
      expect(meta).toMatchObject({ description: 'Login email' });
    });
  });

  describe('wrappers', () => {
    it('optional marks selfRequired as false', () => {
      const { selfRequired } = applySwaggerDecorators(z.string().optional());
      expect(selfRequired).toBe(false);
    });

    it('nullable adds nullable: true', () => {
      const { so } = applySwaggerDecorators(z.string().nullable());
      expect(so).toEqual({ type: 'string', nullable: true });
    });

    it('default marks selfRequired as false and forwards default value', () => {
      const { so, selfRequired } = applySwaggerDecorators(z.string().default('hello'));
      expect(selfRequired).toBe(false);
      expect(so).toMatchObject({ type: 'string', default: 'hello' });
    });

    it('default forwards numeric value', () => {
      const { so } = applySwaggerDecorators(z.number().default(42));
      expect(so).toMatchObject({ type: 'number', default: 42 });
    });

    it('default forwards on enum', () => {
      const { so } = applySwaggerDecorators(z.enum(['admin', 'user', 'guest']).default('user'));
      expect(so).toMatchObject({ enum: ['admin', 'user', 'guest'], default: 'user' });
    });

    it('default(() => value) — thunk is resolved once at generation time', () => {
      // Zod 4 exposes `defaultValue` as a getter that re-invokes the thunk on each access.
      // We snapshot the resolved value into the OpenAPI spec at decoration time. Anything
      // non-stable (Date.now(), randomUUID(), ...) freezes to whatever the first call returned.
      let counter = 0;
      const schema = z.string().default(() => `auto-${++counter}`);
      const before = counter;
      const { so } = applySwaggerDecorators(schema);
      // The thunk fires exactly once during decoration:
      expect(counter).toBe(before + 1);
      expect(so).toMatchObject({ type: 'string', default: `auto-${counter}` });
    });

    describe('thunk default does not get re-evaluated across', () => {
      it('JS subclass of a DTO (class Child extends Parent {})', () => {
        let counter = 0;
        class Parent extends ZodDto(z.object({ x: z.string().default(() => `auto-${++counter}`) })) {}
        class Child extends Parent {
          method() {
            return this.x;
          }
        }
        applySwaggerDecorators(Parent);
        applySwaggerDecorators(Child);

        const pMeta = Reflect.getMetadata('swagger/apiModelProperties', Parent.prototype, 'x') as { default?: unknown };
        const cMeta = Reflect.getMetadata('swagger/apiModelProperties', Child.prototype, 'x') as { default?: unknown };
        expect(counter).toBe(1);
        expect(pMeta.default).toBe('auto-1');
        expect(cMeta?.default ?? pMeta.default).toBe('auto-1');
      });

      it('nesting via z.array(Parent)', () => {
        let counter = 0;
        class Parent extends ZodDto(z.object({ x: z.string().default(() => `auto-${++counter}`) })) {}
        class AnotherOne extends ZodDto(z.object({ arr: z.array(Parent) })) {}

        applySwaggerDecorators(Parent);
        applySwaggerDecorators(AnotherOne);
        expect(counter).toBe(1);
        const pMeta = Reflect.getMetadata('swagger/apiModelProperties', Parent.prototype, 'x') as { default?: unknown };
        expect(pMeta.default).toBe('auto-1');
      });

      it('derivation via Parent.extend({...})', () => {
        let counter = 0;
        class Parent extends ZodDto(z.object({ x: z.string().default(() => `auto-${++counter}`) })) {}
        class Extended extends Parent.extend({ y: z.int() }) {}

        applySwaggerDecorators(Parent);
        applySwaggerDecorators(Extended);

        const pMeta = Reflect.getMetadata('swagger/apiModelProperties', Parent.prototype, 'x') as { default?: unknown };
        const eMeta = Reflect.getMetadata('swagger/apiModelProperties', Extended.prototype, 'x') as { default?: unknown };
        expect(counter).toBe(1);
        expect(pMeta.default).toBe('auto-1');
        expect(eMeta.default).toBe('auto-1');
      });
    });

    it('default + @ApiProperty: a DTO field gets the default in metadata', () => {
      class WithRoleDto extends ZodDto(
        z.object({
          role: z.enum(['admin', 'user', 'guest']).default('user'),
        }),
      ) {}
      // Trigger decoration via the on-create hook (registered by importing nestjs entrypoint).
      // Here we apply directly to assert the SchemaObject shape:
      applySwaggerDecorators(WithRoleDto);
      const meta = Reflect.getMetadata('swagger/apiModelProperties', WithRoleDto.prototype, 'role') as { default?: unknown };
      expect(meta).toMatchObject({ default: 'user' });
    });

    it('null schema', () => {
      const { so } = applySwaggerDecorators(z.null());
      expect(so).toEqual({ nullable: true });
    });
  });

  describe('unions & intersections', () => {
    it('union of scalars', () => {
      const { so } = applySwaggerDecorators(z.union([z.string(), z.number()]));
      expect(so).toEqual({ oneOf: [{ type: 'string' }, { type: 'number' }] });
    });

    it('intersection produces allOf', () => {
      const { so } = applySwaggerDecorators(z.intersection(z.object({ a: z.string() }), z.object({ b: z.number() })));
      expect(so.allOf).toHaveLength(2);
    });
  });

  describe('DTO class decoration', () => {
    it('decorates DTO class and returns $ref-style schema', () => {
      const TestDto = ZodDto(z.object({ value: z.string() }));
      const { so, innerSchemas } = applySwaggerDecorators(TestDto);
      expect(so.oneOf).toBeDefined();
      expect(innerSchemas.has(TestDto)).toBe(true);
    });

    it('handles nested DTO references', () => {
      const InnerDto = ZodDto(z.object({ x: z.number() }));
      const OuterDto = ZodDto(z.object({ inner: InnerDto }));
      const { innerSchemas } = applySwaggerDecorators(OuterDto);
      expect(innerSchemas.has(OuterDto)).toBe(true);
    });
  });

  describe('recursive schemas (z.lazy)', () => {
    it('does not stack-overflow on a self-referential ZodLazy', () => {
      type CommentT = { text: string; replies: CommentT[] };
      const CommentSchema: z.ZodType<CommentT> = z.lazy(() => z.object({ text: z.string(), replies: z.array(CommentSchema) }));
      // Should not throw RangeError: Maximum call stack size exceeded.
      expect(() => applySwaggerDecorators(CommentSchema)).not.toThrow();
    });

    it('does not stack-overflow when a DTO wraps a self-referential ZodLazy', () => {
      type CommentT = { text: string; replies: CommentT[] };
      const CommentSchema: z.ZodType<CommentT> = z.lazy(() => z.object({ text: z.string(), replies: z.array(CommentSchema) }));
      class CommentDto extends ZodDto(CommentSchema as unknown as z.ZodObject<{ text: z.ZodString }>) {}
      expect(() => applySwaggerDecorators(CommentDto)).not.toThrow();
    });

    it('does not stack-overflow when a DTO references itself via lazyDto in its shape', () => {
      class CategoryDto extends ZodDto(
        z.object({
          name: z.string(),
          children: z.array(lazyDto<CategoryDto>(() => CategoryDto)),
        }),
      ) {}
      expect(() => applySwaggerDecorators(CategoryDto)).not.toThrow();
      // Re-entry on the lazy resolves to a $ref to CategoryDto, not a placeholder:
      const meta = Reflect.getMetadata('swagger/apiModelProperties', CategoryDto.prototype, 'children') as { type?: unknown };
      expect(meta).toBeDefined();
    });

    // Self-reference: `lazyDto<X>(() => X)` thunk fires while `X` is still in TDZ
    // when the swagger hook runs synchronously inside `extends ZodDto(...)`.
    it('does NOT crash with ReferenceError when the hook defers to a microtask', async () => {
      const unregister = registerOnCreate((dto) => void Promise.resolve().then(() => applySwaggerDecorators(dto)));
      try {
        let CategoryDtoCaptured!: Function;
        expect(() => {
          class CategoryDto extends ZodDto(
            z.object({
              name: z.string(),
              children: z.array(lazyDto<CategoryDto>(() => CategoryDto)),
            }),
          ) {}
          CategoryDtoCaptured = CategoryDto;
        }).not.toThrow();

        await Promise.resolve();
        const meta = Reflect.getMetadata('swagger/apiModelProperties', CategoryDtoCaptured.prototype, 'children') as { items?: { $ref?: string } };
        expect(meta.items?.$ref).toBe(getSchemaPath(CategoryDtoCaptured));
      } finally {
        unregister();
      }
    });

    // Mutual recursion (Author ↔ Book): `Book` doesn't exist yet when Author declaration runs.
    it('mutually recursive DTOs (Author ↔ Book) decorate without ReferenceError', async () => {
      const unregister = registerOnCreate((dto) => void Promise.resolve().then(() => applySwaggerDecorators(dto)));
      try {
        let AuthorCaptured!: Function;
        let BookCaptured!: Function;
        expect(() => {
          class Author extends ZodDto(
            z.object({
              name: z.string(),
              books: z.array(lazyDto<Book>(() => Book)),
            }),
          ) {}

          class Book extends ZodDto(
            z.object({
              title: z.string(),
              author: lazyDto<Author>(() => Author),
            }),
          ) {}

          AuthorCaptured = Author;
          BookCaptured = Book;
        }).not.toThrow();

        await Promise.resolve();
        const authorBooks = Reflect.getMetadata('swagger/apiModelProperties', AuthorCaptured.prototype, 'books') as { items?: { $ref?: string } };
        const bookAuthor = Reflect.getMetadata('swagger/apiModelProperties', BookCaptured.prototype, 'author') as { oneOf?: Array<{ $ref?: string }> };
        expect(authorBooks.items?.$ref).toBe(getSchemaPath(BookCaptured));
        expect(bookAuthor.oneOf?.[0]?.$ref).toBe(getSchemaPath(AuthorCaptured));
      } finally {
        unregister();
      }
    });
  });

  describe('unsupported types', () => {
    it('throws on undefined', () => {
      expect(() => applySwaggerDecorators(z.undefined())).toThrow('cannot be represented in JSON');
    });

    it('throws on void', () => {
      expect(() => applySwaggerDecorators(z.void())).toThrow('cannot be represented in JSON');
    });

    it('handles z.any()', () => {
      const { so } = applySwaggerDecorators(z.any());
      expect(so).toEqual({});
    });

    it('handles z.unknown()', () => {
      const { so } = applySwaggerDecorators(z.unknown());
      expect(so).toEqual({});
    });
  });
});
