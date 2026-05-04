import 'reflect-metadata';
import { type ToDtoOptions, ZodDto, ZodDtoValidationError } from '@voznov/zod-dto';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ZodDtoSerializationError, ZodResponse, ZodSerialize } from '../src/zod-serialize';

class UserDto extends ZodDto(z.object({ id: z.uuid(), name: z.string(), pwd: z.string() }), { out: ({ pwd: _p, ...rest }) => rest }) {}

// Vitest's esbuild loader does NOT emit `design:returntype` metadata, unlike a real
// TS-compiled NestJS project (where `emitDecoratorMetadata: true` produces it). To
// keep these unit tests independent of the bundler, we set the metadata manually —
// simulating what TS would emit at compile time — then apply the decorator manually.
const decorate = <T extends object>(target: T, key: keyof T & string, returnType: unknown, schema?: z.ZodType, options?: ToDtoOptions) => {
  if (returnType !== undefined) Reflect.defineMetadata('design:returntype', returnType, target, key);
  const desc = Object.getOwnPropertyDescriptor(target, key);
  if (!desc) throw new Error(`no descriptor for ${key}`);
  (schema ? ZodSerialize(schema, options) : ZodSerialize(undefined, options))(target, key, desc);
  Object.defineProperty(target, key, desc);
};

const decorateAsResponse = <T extends object>(
  target: T,
  key: keyof T & string,
  returnType: unknown,
  schema?: z.ZodType,
  responseOptions?: { status?: number; description?: string },
) => {
  if (returnType !== undefined) Reflect.defineMetadata('design:returntype', returnType, target, key);
  const desc = Object.getOwnPropertyDescriptor(target, key);
  if (!desc) throw new Error(`no descriptor for ${key}`);
  (schema ? ZodResponse(schema, responseOptions) : ZodResponse(undefined, responseOptions))(target, key, desc);
  Object.defineProperty(target, key, desc);
};

const API_RESPONSE_KEY = 'swagger/apiResponse';
const API_EXTRA_MODELS_KEY = 'swagger/apiExtraModels';

describe('ZodSerialize (method decorator)', () => {
  describe('implicit schema (design:returntype)', () => {
    it('parses sync return value through the inferred return type', () => {
      class Repo {
        findOne(): UserDto {
          return { id: '00000000-0000-4000-8000-000000000000', name: 'Ada', pwd: 'secret' } as never;
        }
      }
      decorate(Repo.prototype, 'findOne', UserDto);

      const u = new Repo().findOne();
      expect(u).toBeInstanceOf(UserDto);
      expect(JSON.parse(JSON.stringify(u))).toEqual({ id: '00000000-0000-4000-8000-000000000000', name: 'Ada' });
    });
  });

  describe('explicit schema', () => {
    it('parses array element-by-element via z.array(Dto)', () => {
      class Repo {
        findAll(): UserDto[] {
          return [
            { id: '00000000-0000-4000-8000-000000000000', name: 'A', pwd: 'x' },
            { id: '00000000-0000-4000-8000-000000000001', name: 'B', pwd: 'y' },
          ] as never;
        }
      }
      decorate(Repo.prototype, 'findAll', Array, z.array(UserDto));

      const xs = new Repo().findAll();
      expect(xs).toHaveLength(2);
      for (const u of xs) expect(u).toBeInstanceOf(UserDto);
    });

    it('parses async (Promise) return', async () => {
      class Repo {
        async findOneAsync(): Promise<UserDto> {
          return { id: '00000000-0000-4000-8000-000000000002', name: 'C', pwd: 'z' } as never;
        }
      }
      decorate(Repo.prototype, 'findOneAsync', Promise, UserDto);

      const u = await new Repo().findOneAsync();
      expect(u).toBeInstanceOf(UserDto);
    });

    it('parses union to the matching variant', () => {
      class Repo {
        either(mode: 'ok' | 'err'): UserDto | { error: string } {
          return mode === 'ok' ? ({ id: '00000000-0000-4000-8000-000000000003', name: 'D', pwd: 'q' } as never) : { error: 'nope' };
        }
      }
      decorate(Repo.prototype, 'either', Object, z.union([UserDto, z.object({ error: z.string() })]));

      const repo = new Repo();
      expect(repo.either('ok')).toBeInstanceOf(UserDto);
      expect(repo.either('err')).toEqual({ error: 'nope' });
    });
  });

  describe('maybe null / undefined', () => {
    it('null returns through without throwing', () => {
      class Repo {
        maybeNull(): UserDto | null {
          return null;
        }
      }
      decorate(Repo.prototype, 'maybeNull', Object, UserDto.nullable());
      expect(new Repo().maybeNull()).toBeNull();
    });

    it('undefined returns through without throwing', () => {
      class Repo {
        maybeUndef(): UserDto | undefined {
          return undefined;
        }
      }
      decorate(Repo.prototype, 'maybeUndef', Object, UserDto.optional());
      expect(new Repo().maybeUndef()).toBeUndefined();
    });
  });

  describe('decoration-time strict throws when schema cannot be resolved', () => {
    const tryDecorateNoSchema = (returnType: unknown) => () => {
      class A {
        foo() {
          return undefined as never;
        }
      }
      decorate(A.prototype, 'foo', returnType);
    };

    it('throws on `: string` (non-Zod primitive)', () => {
      expect(tryDecorateNoSchema(String)).toThrow(/design:returntype "String" is not a Zod schema/);
    });

    it('throws on `: Promise<...>` (generic erased)', () => {
      expect(tryDecorateNoSchema(Promise)).toThrow(/design:returntype "Promise" is not a Zod schema/);
    });

    it('throws on `: T[]` (generic erased)', () => {
      expect(tryDecorateNoSchema(Array)).toThrow(/design:returntype "Array" is not a Zod schema/);
    });

    it('throws on missing return type annotation', () => {
      expect(tryDecorateNoSchema(undefined)).toThrow(/design:returntype "unknown" is not a Zod schema/);
    });
  });

  describe('runtime: invalid return → ZodDtoSerializationError', () => {
    it('sync method throws subclass error', () => {
      class Repo {
        broken(): UserDto {
          return { id: 'not-a-uuid', name: 'X', pwd: 'y' } as never;
        }
      }
      decorate(Repo.prototype, 'broken', UserDto);
      let thrown: unknown;
      try {
        new Repo().broken();
      } catch (e) {
        thrown = e;
      }
      expect(thrown).toBeInstanceOf(ZodDtoSerializationError);
      expect(thrown).toBeInstanceOf(ZodDtoValidationError);
      expect((thrown as ZodDtoSerializationError).issues[0]).toMatch(/^id:/);
    });

    it('async method rejects with subclass error', async () => {
      class Repo {
        async brokenAsync(): Promise<UserDto> {
          return { id: 'not-a-uuid', name: 'X', pwd: 'y' } as never;
        }
      }
      decorate(Repo.prototype, 'brokenAsync', Promise, UserDto);
      await expect(new Repo().brokenAsync()).rejects.toBeInstanceOf(ZodDtoSerializationError);
    });
  });

  describe('options', () => {
    it('observers fire on successful serialize with the parsed value', () => {
      const seen: unknown[] = [];
      class Repo {
        findOne(): UserDto {
          return { id: '00000000-0000-4000-8000-000000000000', name: 'Ada', pwd: 'secret' } as never;
        }
      }
      decorate(Repo.prototype, 'findOne', UserDto, undefined, { observers: [(v) => seen.push(v)] });
      const u = new Repo().findOne();
      expect(seen).toHaveLength(1);
      expect(seen[0]).toBe(u);
    });

    it('caller-provided errorClass overrides the default ZodDtoSerializationError', () => {
      class CustomError extends ZodDtoValidationError {}
      class Repo {
        broken(): UserDto {
          return { id: 'not-a-uuid', name: 'X', pwd: 'y' } as never;
        }
      }
      decorate(Repo.prototype, 'broken', UserDto, undefined, { errorClass: CustomError });
      expect(() => new Repo().broken()).toThrow(CustomError);
    });
  });

  describe('asResponse() — runtime serialization (still wraps method)', () => {
    it('parses return value through the schema (DTO class)', () => {
      class C {
        findOne(): UserDto {
          return { id: '00000000-0000-4000-8000-000000000000', name: 'Ada', pwd: 'secret' } as never;
        }
      }
      decorateAsResponse(C.prototype, 'findOne', UserDto);
      const u = new C().findOne();
      expect(u).toBeInstanceOf(UserDto);
      expect(JSON.parse(JSON.stringify(u))).toEqual({ id: '00000000-0000-4000-8000-000000000000', name: 'Ada' });
    });

    it('throws ZodDtoSerializationError on invalid return', () => {
      class C {
        broken(): UserDto {
          return { id: 'bad', name: 'X', pwd: 'y' } as never;
        }
      }
      decorateAsResponse(C.prototype, 'broken', UserDto);
      expect(() => new C().broken()).toThrow(ZodDtoSerializationError);
    });
  });

  describe('asResponse() — ApiResponse metadata', () => {
    it('sets metadata at default status 200 with a $ref-bearing schema for a DTO class', () => {
      class C {
        findOne(): UserDto {
          return { id: '00000000-0000-4000-8000-000000000000', name: 'A', pwd: 'b' } as never;
        }
      }
      decorateAsResponse(C.prototype, 'findOne', UserDto);
      const meta = Reflect.getMetadata(API_RESPONSE_KEY, C.prototype.findOne);
      expect(meta).toBeDefined();
      expect(meta).toHaveProperty('200');
      expect(meta['200']).toMatchObject({ schema: expect.any(Object) });
    });

    it('overrides status from { status }', () => {
      class C {
        create(): UserDto {
          return { id: '00000000-0000-4000-8000-000000000000', name: 'A', pwd: 'b' } as never;
        }
      }
      decorateAsResponse(C.prototype, 'create', UserDto, undefined, { status: 201 });
      const meta = Reflect.getMetadata(API_RESPONSE_KEY, C.prototype.create);
      expect(meta).toHaveProperty('201');
      expect(meta).not.toHaveProperty('200');
    });

    it('passes description through', () => {
      class C {
        get(): UserDto {
          return { id: '00000000-0000-4000-8000-000000000000', name: 'A', pwd: 'b' } as never;
        }
      }
      decorateAsResponse(C.prototype, 'get', UserDto, undefined, { description: 'fetched user' });
      const meta = Reflect.getMetadata(API_RESPONSE_KEY, C.prototype.get);
      expect(meta['200'].description).toBe('fetched user');
    });
  });

  describe('asResponse() — schema variations', () => {
    it('z.array(DtoClass): array schema + DTO registered via ApiExtraModels', () => {
      class C {
        list(): UserDto[] {
          return [] as never;
        }
      }
      decorateAsResponse(C.prototype, 'list', Array, z.array(UserDto));
      const meta = Reflect.getMetadata(API_RESPONSE_KEY, C.prototype.list);
      expect(meta['200'].schema).toMatchObject({ type: 'array' });

      const extras: unknown[] | undefined = Reflect.getMetadata(API_EXTRA_MODELS_KEY, C);
      expect(extras).toBeDefined();
      expect(extras).toContain(UserDto);
    });

    it('z.union of DTOs: registers all branches via ApiExtraModels', () => {
      class ErrorDto extends ZodDto(z.object({ code: z.string() })) {}
      class C {
        either(): UserDto | ErrorDto {
          return { id: '00000000-0000-4000-8000-000000000000', name: 'A', pwd: 'b' } as never;
        }
      }
      decorateAsResponse(C.prototype, 'either', Object, z.union([UserDto, ErrorDto]));
      const meta = Reflect.getMetadata(API_RESPONSE_KEY, C.prototype.either);
      expect(meta).toHaveProperty('200');
      expect(meta['200'].schema).toBeDefined();

      const extras: unknown[] | undefined = Reflect.getMetadata(API_EXTRA_MODELS_KEY, C);
      expect(extras).toEqual(expect.arrayContaining([UserDto, ErrorDto]));
    });

    it('primitive schema (z.string()): inline type, no ApiExtraModels', () => {
      class C {
        ping(): string {
          return 'pong' as never;
        }
      }
      decorateAsResponse(C.prototype, 'ping', String, z.string());
      const meta = Reflect.getMetadata(API_RESPONSE_KEY, C.prototype.ping);
      expect(meta['200'].schema).toMatchObject({ type: 'string' });

      const extras: unknown[] | undefined = Reflect.getMetadata(API_EXTRA_MODELS_KEY, C);
      expect(extras ?? []).toHaveLength(0);
    });
  });

  describe('asResponse() — schema resolution', () => {
    it('resolves schema from design:returntype when arg omitted', () => {
      class C {
        findOne(): UserDto {
          return { id: '00000000-0000-4000-8000-000000000000', name: 'A', pwd: 'b' } as never;
        }
      }
      decorateAsResponse(C.prototype, 'findOne', UserDto);
      const u = new C().findOne();
      expect(u).toBeInstanceOf(UserDto);
      const meta = Reflect.getMetadata(API_RESPONSE_KEY, C.prototype.findOne);
      expect(meta).toHaveProperty('200');
    });

    it('throws when no schema and design:returntype is non-Zod', () => {
      class C {
        foo() {
          return 'x' as never;
        }
      }
      expect(() => decorateAsResponse(C.prototype, 'foo', String)).toThrow(/design:returntype "String" is not a Zod schema/);
    });
  });
});
