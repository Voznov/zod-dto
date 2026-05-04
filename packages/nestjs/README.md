# @voznov/zod-dto-nestjs

NestJS adapter for [`@voznov/zod-dto`](https://www.npmjs.com/package/@voznov/zod-dto) — validation pipe + automatic Swagger integration.

## Install

```bash
pnpm add @voznov/zod-dto-nestjs @voznov/zod-dto @nestjs/common @nestjs/swagger zod
```

## Quick start

Register the pipe globally, then use DTO classes as controller parameter types:

```ts
// main.ts
import { ZodValidationPipe } from '@voznov/zod-dto-nestjs';
app.useGlobalPipes(new ZodValidationPipe());
```

```ts
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ZodDto } from '@voznov/zod-dto';
import { z } from 'zod';

class CreateUserDto extends ZodDto(z.object({ name: z.string(), email: z.email() })) {}
class UserIdParam extends ZodDto(z.object({ id: z.uuid() })) {}
class ListUsersQuery extends ZodDto(z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})) {}

@Controller('users')
export class UsersController {
  @Post()
  create(@Body() body: CreateUserDto) {
    // already validated; `body` is a CreateUserDto instance.
  }

  // `@Param() params: UserIdParam` — `id` validated as UUID, format: 'uuid' in the spec.
  // (Cleaner than `@Param('id', ParseUUIDPipe) id: string`, and the spec carries the format.)
  @Get(':id')
  findOne(@Param() params: UserIdParam) { /* ... */ }

  // `@Query() query: ListUsersQuery` — every Zod field becomes one OpenAPI query parameter,
  // with per-field validation, defaults, and descriptions, no extra `@ApiQuery` decorators needed.
  @Get()
  list(@Query() query: ListUsersQuery) { /* ... */ }
}
```

## Gradual migration

`ZodValidationPipe` only engages when the parameter's metatype is a `ZodDtoClass` — every other type (primitives, plain classes, class-validator DTOs with `ValidationPipe`) passes through untouched. Safe to register globally alongside an existing setup; convert DTOs one at a time.

## Swagger integration

Importing this package side-effect-registers an `onCreate` hook that decorates every DTO class with `@ApiProperty` metadata based on its Zod schema — no manual decorators required. **Import order doesn't matter**: DTOs created before `@voznov/zod-dto-nestjs` was imported are retroactively decorated at hook registration, so `import '@voznov/zod-dto-nestjs'` from anywhere in the app works.

Supported shapes: scalars, objects (nested), arrays, tuples, records, enums, literals, unions (including discriminated), intersections, optional/nullable/default wrappers, and nested DTO references (via `oneOf` + `ApiExtraModels`).

`.default(value)` is forwarded to the OpenAPI `default` keyword.

> ⚠️ **Lazy defaults are frozen at decoration time.** For `.default(() => ...)`, the thunk is invoked **once** when the swagger metadata is generated, and the resolved value is baked into the spec. Anything non-stable — `Date.now()`, `randomUUID()`, `new Date()` — will freeze at the value the server happened to produce on startup, and every endpoint's example in your docs will show that one stale value. Use a stable thunk, or a literal default.

`.describe(text)` is forwarded to the OpenAPI `description` keyword. Works on the wrapper or on the inner type — `z.string().describe('Login email').optional()` and `z.string().optional().describe('Login email')` both end up with `description: 'Login email'` in the spec.

`.refine(...)` validators run at request-validation time but are **not** reflected in the spec — JSON Schema can't express custom predicates, and a single `description` for a chain of refines (`.refine(...).refine(...).refine(...)`) would be ambiguous. Put human-readable docs in `.describe(...)` instead.

> ⚠️ **`in` / `out` hooks are runtime-only.** The walker only reads the schema's structure, not the options passed to `ZodDto(schema, { in, out })`. A `out: ({ password, ...rest }) => rest` correctly strips `password` from the response *body*, but the OpenAPI schema still lists `password` as a property — the spec lies about a field that runtime drops. Same for `in`: snake_case→camelCase aliases applied via `in` are invisible in the spec, so docs show only the camelCase shape. If spec-correctness matters, either omit the field from the schema itself (`schema.omit({ password: true })`) or maintain a separate response DTO.

### Reference nested DTOs by class, not by raw schema

```ts
// ❌ Inlines NoteDto's full shape into items[]; codegen produces two separate types for the same data.
class PaginatedNotes extends ZodDto(z.object({ items: z.array(noteSchema) })) {}

// ✅ Emits `items: { type: 'array', items: { $ref: '#/components/schemas/NoteDto' } }`.
class PaginatedNotes extends ZodDto(z.object({ items: z.array(NoteDto) })) {}
```

Both forms parse identically, but only the second one keeps the spec DRY — `$ref` instead of an inlined copy. Use the DTO class itself in nested positions whenever you have one.

### Recursive schemas (`z.lazy` / `lazyDto`)

For self-referential shapes (comment trees, file trees, ...) wrap the recursion in a DTO and reference it back via `lazyDto` — the Swagger walker emits a proper `$ref` at the cycle, and `lazyDto` keeps TypeScript from tripping over the circular self-reference:

```ts
import { lazyDto, ZodDto } from '@voznov/zod-dto';

class CategoryDto extends ZodDto(
  z.object({
    name: z.string(),
    children: z.array(lazyDto<CategoryDto>(() => CategoryDto)),
  }),
) {}
// → children items become `$ref: '#/components/schemas/CategoryDto'`
// → at the type level, `instance.children[0].name` is `string`, not `unknown`.
```

`lazyDto<T>(thunk)` is a thin wrapper over `z.lazy` with two type-level tweaks: the explicit generic carries the *instance type* `T`, and the thunk argument is typed `() => any` so TS skips body return-type inference (the source of the circular-class error). Plain `z.lazy(...)` works at runtime too, but you'd need a separate `type Category = {...}` + `(): z.ZodType<Category>` annotation to keep the inferred field types non-`unknown`.

If the recursive position resolves to an anonymous `ZodObject` (no DTO wrap), the walker emits an empty `{}` placeholder there — it won't crash, but Swagger UI will show `any` instead of the recursive structure. Wrap it in `ZodDto` if you want the cycle visible in your docs.

## Custom error response

`ZodValidationPipe` accepts `{ createError }`. Default throws `BadRequestException` with the issues list as its response body.

```ts
import { HttpException, HttpStatus } from '@nestjs/common';

app.useGlobalPipes(
  new ZodValidationPipe({
    createError: (issues) =>
      new HttpException({ statusCode: 400, error: 'Bad Request', errors: issues }, HttpStatus.BAD_REQUEST),
  }),
);
```

## API

| Export                           | Description                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `ZodValidationPipe`              | `PipeTransform` for `@Body()` / `@Param()` / `@Query()`. Accepts `{ createError?: (issues: string[]) => Error }`.              |
| `applySwaggerDecorators(schema)` | Low-level: apply `@ApiProperty` metadata to a schema. Auto-invoked via `registerOnCreate`; export is for manual/edge-case use. |

## License

[Apache-2.0](./LICENSE)
