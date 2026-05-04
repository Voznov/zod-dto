import { z } from 'zod';

/**
 * `z.lazy(...)` with an explicit-generic shortcut so a DTO can reference itself
 * without falling into TS's circular-base-class error. The thunk is typed
 * `() => any` to skip body return-type inference; the explicit generic carries
 * the *instance type* the schema parses to.
 *
 * ```ts
 * class CategoryDto extends ZodDto(
 *   z.object({
 *     name: z.string(),
 *     children: z.array(lazyDto<CategoryDto>(() => CategoryDto)),
 *   }),
 * ) {}
 * ```
 */
export const lazyDto = <T>(thunk: () => any): z.ZodType<T> => z.lazy(thunk);
