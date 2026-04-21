# @voznov/zod-dto

TypeScript DTO factory built on Zod 4. Turn a Zod object schema into a validatable DTO class — composable via `.extend()`/`.pick()`/`.omit()`, serializable via `JSON.stringify`.

## Packages

- [`@voznov/zod-dto`](packages/core) — framework-agnostic core.
- [`@voznov/zod-dto-nestjs`](packages/nestjs) — NestJS adapter: validation pipe + Swagger integration.

## Scripts

```
pnpm build       # build both packages (tsup: ESM + CJS + dts)
pnpm test        # run vitest across the workspace
pnpm typecheck   # tsc --noEmit per package
pnpm lint        # eslint
pnpm check:all   # typecheck + lint + test
```

## License

[Apache-2.0](./LICENSE)
