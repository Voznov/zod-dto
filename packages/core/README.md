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

class UserDto extends ZodDto(
  z.object({
    id: z.uuid(),
    name: z.string(),
    email: z.email(),
  }),
) {}

// `UserDto` is both a type and a value under one name — use it directly:
function greet(u: UserDto) { return `Hi, ${u.name}`; }
const user = toDto(UserDto, rawData); // parse + validate; throws ZodDtoValidationError
greet(user);
```

Prefer `class X extends ZodDto(...) {}` over `const X = ZodDto(...)` + `type X = z.infer<typeof X>` — it collapses the two names into one and `instanceof X` works for free.

`toDto(UserDto, raw)` is just `UserDto.safeParse(raw)` + throw on failure + return the (already-constructed) instance. The DTO class is itself a Zod schema, so you can call `.safeParse` / `.parse` (and async variants) directly when you'd rather get a `Result` than a throw — the returned `data` is a real `UserDto` instance either way:

```ts
const r = UserDto.safeParse(rawData);
if (r.success) r.data instanceof UserDto; // true
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

## Subclassing with methods (advanced)

You can add methods on the subclass:

```ts
class MyPoint extends ZodDto(z.object({ x: z.number(), y: z.number() })) {
  label() {
    return `(${this.x}, ${this.y})`;
  }
}

const p = toDto(MyPoint, { x: 3, y: 4 });
p.label(); // '(3, 4)' — works at top level
```

This works at runtime **everywhere** — every DTO node in the parse result is constructed into the right class. But in **nested** schema positions (`z.array(MyPoint)`, `z.object({ p: MyPoint })`, discriminated unions, ...) `z.infer<>` falls back to the plain shape (`{x, y}`), so you'd need `as InstanceType<typeof MyPoint>` to reach subclass methods.

To make subclass methods propagate through nested positions in the type system, use the `<Self>()` two-step:

```ts
class MyPoint extends ZodDto<MyPoint>()(z.object({ x: z.number(), y: z.number() })) {
  label() { return `(${this.x}, ${this.y})`; }
}

const List = ZodDto(z.object({ points: z.array(MyPoint) }));
const result = toDto(List, { points: [{ x: 1, y: 2 }] });
result.points[0].label(); // OK — no cast
```

The generic fills `Self` so `z.infer<>` carries the subclass type; the empty `()` then receives the schema with `T` properly inferred (TypeScript can't do both partial-explicit generics and inference in one call).

## Composition

`.extend` / `.pick` / `.omit` build a **new** DTO from the base's shape — and the shape is all that carries over. The `in` hook, the `out` hook, subclass methods, and any custom prototype members are intentionally dropped.

The reason is type safety: a different shape invalidates the typed argument of `in`/`out` and may invalidate the bodies of subclass methods (a method that touches `this.password` would `tsc`-pass on a derived class that no longer has `password`). Silently inheriting them would either lie at the type level or crash at runtime.

```ts
const BaseDto = ZodDto(z.object({ id: z.uuid(), name: z.string() }));
const CreateDto = BaseDto.omit({ id: true });
const NamedOnlyDto = BaseDto.pick({ name: true });
const WithEmailDto = BaseDto.extend({ email: z.email() });
```

### ⚠️ Re-apply `out` for security-sensitive DTOs

If your base DTO uses `out` to strip sensitive fields (`password`, internal IDs, ...), the derived DTO will **not** inherit it — the field can re-leak through `JSON.stringify`. Re-apply `out` (or wrap `pick`/`omit` so the field cannot exist in the derived shape at all):

```ts
const UserDto = ZodDto(
  z.object({ id: z.string(), name: z.string(), password: z.string() }),
  { out: ({ password: _password, ...rest }) => rest },
);

// ❌ password leaks back — `out` was dropped:
const PublicDto = UserDto.omit({ id: true });

// ✅ either re-apply `out`...
const PublicDto2 = ZodDto(
  z.object({ name: z.string(), password: z.string() }),
  { out: ({ password: _password, ...rest }) => rest },
);

// ✅ ...or omit the sensitive field from the shape itself:
const PublicDto3 = UserDto.omit({ id: true, password: true });
```

### Re-attach methods on the derived class

If you need methods on the derived DTO, subclass the result of the derivation:

```ts
class Point extends ZodDto(z.object({ x: z.number(), y: z.number() })) {
  sum() { return this.x + this.y; }
}

// ❌ `Point3D.prototype.sum` is undefined — derivations build a fresh class.
const Point3D = Point.extend({ z: z.number() });

// ✅ Subclass the derivation to add methods on the new shape:
class Point3DWithSum extends Point.extend({ z: z.number() }) {
  sum() { return this.x + this.y + this.z; }
}
```

### `.partial()` / `.required()` / `.merge()` — wrap in `ZodDto(...)`

`.extend/.pick/.omit` are first-class on a DTO class because they're the most common derivations. Other Zod object methods — `.partial()`, `.required()`, `.merge()`, etc. — are still callable (every Zod schema method is preserved), but they return a plain `ZodObject`, not a DTO. To get a DTO back, wrap once in `ZodDto(...)`:

```ts
class CreateUserDto extends ZodDto(
  z.object({ name: z.string().min(2), email: z.email(), age: z.number().int().min(18) }),
) {}

// CreateUserDto + UpdateUserDto pattern (the class-validator / @nestjs/swagger PartialType analogue):
class UpdateUserDto extends ZodDto(CreateUserDto.partial()) {}

// Same for `.required()`, `.merge()`, etc.:
class StrictDto extends ZodDto(CreateUserDto.partial().required()) {}
```

The wrap is intentional, not boilerplate: it picks up the new shape, applies the per-class instance walker, and re-fires `onCreate` (so Swagger metadata is regenerated on the partial shape — without the wrap you'd get `@ApiProperty` for the original fields).

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
    e.issues; // ['email: Invalid email', 'age: Too small', ...] — full structured list
    e.message; // '2 issues: "email: Invalid email" (+1 more)' — short summary, log-friendly
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
