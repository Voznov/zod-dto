# @voznov/zod-dto-nestjs

NestJS adapter for `@voznov/zod-dto` — validation pipe + automatic Swagger integration.

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
import { Body, Controller, Post } from '@nestjs/common';
import { ZodDto } from '@voznov/zod-dto';
import { z } from 'zod';

class CreateUserDto extends ZodDto(z.object({ name: z.string(), email: z.email() })) {}

@Controller('users')
export class UsersController {
  @Post()
  create(@Body() body: CreateUserDto) {
    // already validated; `body` is a CreateUserDto instance.
  }
}
```

## Gradual migration

`ZodValidationPipe` only engages when the parameter's metatype is a `ZodDtoClass` — every other type (primitives, plain classes, class-validator DTOs with `ValidationPipe`) passes through untouched. Safe to register globally alongside an existing setup; convert DTOs one at a time.

## Swagger integration

Importing this package side-effect-registers an `onCreate` hook that decorates every DTO class with `@ApiProperty` metadata based on its Zod schema — no manual decorators required. **Import order doesn't matter**: DTOs created before `@voznov/zod-dto-nestjs` was imported are retroactively decorated at hook registration, so `import '@voznov/zod-dto-nestjs'` from anywhere in the app works.

Supported shapes: scalars, objects (nested), arrays, tuples, records, enums, literals, unions (including discriminated), intersections, optional/nullable/default wrappers, and nested DTO references (via `oneOf` + `ApiExtraModels`).

`.default(value)` is forwarded to the OpenAPI `default` keyword. For lazy defaults (`.default(() => ...)`), the thunk is invoked **once** at decoration time and the resolved value is frozen into the spec — use a stable thunk (don't put `Date.now()` / `randomUUID()` here unless you want the server-startup value baked into your docs).

`.describe(text)` is forwarded to the OpenAPI `description` keyword. Works on the wrapper or on the inner type — `z.string().describe('Login email').optional()` and `z.string().optional().describe('Login email')` both end up with `description: 'Login email'` in the spec.

`.refine(...)` validators run at request-validation time but are **not** reflected in the spec — JSON Schema can't express custom predicates, and a single `description` for a chain of refines (`.refine(...).refine(...).refine(...)`) would be ambiguous. Put human-readable docs in `.describe(...)` instead.

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
