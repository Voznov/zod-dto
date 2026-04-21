# @voznov/zod-dto

Framework-agnostic DTO factory built on Zod 4. Turn a Zod object schema into a DTO class — validatable, composable, and serializable via `JSON.stringify`.

## Install

```bash
pnpm add @voznov/zod-dto zod
```

## Quick start

```ts
import { z } from 'zod';
import { ZodDto, toDto } from '@voznov/zod-dto';

const UserDto = ZodDto(
  z.object({
    id: z.uuid(),
    name: z.string(),
    email: z.email(),
  }),
);

type User = z.infer<typeof UserDto>;

// Parse + validate. Throws ZodDtoValidationError on failure.
const user = toDto(UserDto, rawData);
// `user` is a UserDto instance.
```

## `options.in` — input preprocessor

Runs as `z.preprocess` before validation. Schema-embedded, so nested DTOs apply their own `in` during a parent's `safeParse`.

```ts
const UserDto = ZodDto(z.object({ userId: z.number(), firstName: z.string() }), {
  in: (data) => /* transform unknown -> parseable shape */ data,
});
```

A common recipe — snake_case → camelCase aliases (copy into your project):

```ts
const aliases =
  (map: Record<string, string>) =>
  (data: unknown): unknown => {
    if (typeof data !== 'object' || data === null) return data;
    const out = { ...data } as Record<string, unknown>;
    for (const [from, to] of Object.entries(map)) {
      if (from in out) {
        if (!(to in out)) out[to] = out[from];
        delete out[from];
      }
    }
    return out;
  };

const UserDto = ZodDto(z.object({ userId: z.number(), firstName: z.string() }), {
  in: aliases({ user_id: 'userId', first_name: 'firstName' }),
});

toDto(UserDto, { user_id: 1, first_name: 'Ada' });
// -> { userId: 1, firstName: 'Ada' }
```

## `options.out` — serialization hook

Attached to the instance prototype as `toJSON`. `JSON.stringify` picks it up automatically; nested DTOs serialize through their own `out`.

```ts
const UserDto = ZodDto(z.object({ firstName: z.string(), lastName: z.string(), password: z.string() }), {
  out: (parsed) => ({
    fullName: `${parsed.firstName} ${parsed.lastName}`,
    // password stripped
  }),
});

const user = toDto(UserDto, { firstName: 'Ada', lastName: 'Lovelace', password: 'x' });
user.password; // 'x' — instance retains the original parsed shape
JSON.stringify(user); // '{"fullName":"Ada Lovelace"}'
```

## It's a real class

`ZodDto(...)` returns a constructable class. `new UserDto()` and `toDto(UserDto, data)` both produce instances — `instanceof UserDto` is true in either case. Handy for NestJS `@Body() body: UserDto`, `instanceof` checks, and class-based DI patterns.

You can subclass to add methods:

```ts
class MyPoint extends ZodDto<MyPoint>()(z.object({ x: z.number(), y: z.number() })) {
  label() {
    return `(${this.x}, ${this.y})`;
  }
}

const p = toDto(MyPoint, { x: 3, y: 4 });
p instanceof MyPoint; // true
p.label(); // '(3, 4)'
```

Note the `<MyPoint>()` two-step call. The generic fills `Self` so `z.infer<>` propagates subclass methods through **nested** schema positions (`z.array(MyPoint)`, `z.object({ p: MyPoint })`, discriminated unions, ...); the empty `()` then receives the schema with `T` properly inferred (TypeScript can't do both partial-explicit generics and inference in one call):

```ts
const List = ZodDto(z.object({ points: z.array(MyPoint) }));
const result = toDto(List, { points: [{ x: 1, y: 2 }] });
result.points[0].label(); // OK — no cast
```

If you omit `<MyPoint>()` and just extend `ZodDto(...)` directly, the class still works at runtime — every DTO node in the parse result is constructed into the right class — but nested-position types fall back to the plain shape (`{x, y}`), so you'd need `as InstanceType<typeof MyPoint>` to reach subclass methods.

## Composition

Derived DTOs inherit the base shape but not the `in`/`out` options (a narrowed shape would invalidate `out`'s typed argument).

```ts
const BaseDto = ZodDto(z.object({ id: z.uuid(), name: z.string() }));
const CreateDto = BaseDto.omit({ id: true });
const NamedOnlyDto = BaseDto.pick({ name: true });
const WithEmailDto = BaseDto.extend({ email: z.email() });
```

## Nested DTOs

A DTO class is a valid Zod schema, usable wherever a schema is accepted.

```ts
const AddressDto = ZodDto(z.object({ city: z.string() }));
const PersonDto = ZodDto(z.object({ name: z.string(), address: AddressDto }));
```

Unions of DTOs work as schema fields:

```ts
const CatDto = ZodDto(z.object({ kind: z.literal('cat'), name: z.string() }));
const DogDto = ZodDto(z.object({ kind: z.literal('dog'), name: z.string() }));
const OwnerDto = ZodDto(z.object({ pet: z.discriminatedUnion('kind', [CatDto, DogDto]) }));
```

## Error handling

```ts
import { ZodDtoValidationError } from '@voznov/zod-dto';

try {
  toDto(UserDto, bad);
} catch (e) {
  if (e instanceof ZodDtoValidationError) {
    e.issues; // ['email: Invalid email', ...]
    e.message; // issues joined with '; '
  }
}
```

## Recipes

### BigInt (string ↔ bigint)

```ts
// Parse: string/number -> bigint
const AmountDto = ZodDto(z.object({ amount: z.coerce.bigint().min(0n) }));

// Serialize: patch BigInt.prototype once at app bootstrap.
declare global {
  interface BigInt {
    toJSON(): string;
  }
}

BigInt.prototype.toJSON = function (this: BigInt) {
  return this.toString();
};
```

### Mixins (e.g. pagination)

Write a function that takes a schema and returns a DTO:

```ts
const withPagination = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) =>
  ZodDto(
    schema.extend({
      page: z.number().int().min(0).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
  );

const ListUsersDto = withPagination(z.object({ search: z.string().optional() }));
```

### Context-aware `out`

`out` receives the whole parsed object, so cross-field logic works naturally. It also runs in normal application scope, so request-scoped context (AsyncLocalStorage, etc.) is available:

```ts
const ProfileDto = ZodDto(z.object({ userId: z.uuid(), secret: z.string() }), {
  out: (parsed) => ({
    ...parsed,
    secret: ctx().userId === parsed.userId ? parsed.secret : undefined,
  }),
});
```

## API

| Export                     | Description                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------- |
| `ZodDto(schema, options?)` | DTO class factory.                                                                 |
| `toDto(DtoClass, data)`    | Validate + return instance(s). Throws `ZodDtoValidationError`.                     |
| `ZodDtoValidationError`    | `{ issues: string[] }` thrown by `toDto`.                                          |
| `formatZodIssues(issues)`  | Format `z.core.$ZodIssue[]` into `path: message` strings.                          |
| `isZodDtoClass(value)`     | Type guard.                                                                        |
| `registerOnCreate(hook)`   | Register a callback fired for every DTO class created. Also fires retroactively for DTOs that existed before registration, so extension packages (Swagger etc.) work regardless of import order. |

## License

[Apache-2.0](./LICENSE)
