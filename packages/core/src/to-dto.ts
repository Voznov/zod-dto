import { z } from 'zod';
import { type ZodDtoClass } from './base';
import { formatZodIssues, ZodDtoValidationError } from './errors';

type ToDtoResult<T extends z.ZodType> = T extends new () => infer U ? U : z.infer<T>;
type Preprocessor = (data: unknown) => unknown;
type Observer = (data: unknown) => void;
type ErrorClass = new (issues: string[]) => ZodDtoValidationError;

export type ToDtoOptions = {
  /** Transform input before validation, applied left-to-right. */
  preprocessors?: Preprocessor[];
  /** Side-effect hooks fired after a successful parse (logging, metrics, tagging). Return value is ignored. */
  observers?: Observer[];
  /** Constructor used when validation fails. Defaults to `ZodDtoValidationError`. */
  errorClass?: ErrorClass;
};

export interface ToDto {
  <T extends z.ZodType | ZodDtoClass>(schema: T, data: unknown, options?: ToDtoOptions): ToDtoResult<T>;
  /**
   * Returns a `toDto`-shaped function with preset options — useful at layer boundaries
   * (e.g. `const fromDb = toDto.with({ preprocessors: [snakeToCamel], errorClass: DbValidationError })`).
   */
  with(options: ToDtoOptions): ToDto;
  with(preprocessor: Preprocessor): ToDto;
}

const pipe =
  (preprocessors: Preprocessor[]): Preprocessor =>
  (data: unknown) => {
    for (const preprocessor of preprocessors) {
      data = preprocessor(data);
    }

    return data;
  };

const combineOptions = (prev?: ToDtoOptions, next?: ToDtoOptions): ToDtoOptions => ({
  preprocessors: [...(prev?.preprocessors ?? []), ...(next?.preprocessors ?? [])],
  observers: [...(prev?.observers ?? []), ...(next?.observers ?? [])],
  errorClass: next?.errorClass ?? prev?.errorClass,
});

const runToDto = <T extends z.ZodType | ZodDtoClass>(schema: T, data: unknown, options?: ToDtoOptions): ToDtoResult<T> => {
  const result = z.preprocess(pipe(options?.preprocessors ?? []), schema).safeParse(data);
  if (!result.success) {
    const ErrorCtor = options?.errorClass ?? ZodDtoValidationError;
    throw new ErrorCtor(formatZodIssues(result.error.issues));
  }

  for (const observer of options?.observers ?? []) observer(result.data);

  return result.data as ToDtoResult<T>;
};

const getToDto = (prevOptions?: ToDtoOptions): ToDto =>
  Object.assign(
    <T extends z.ZodType | ZodDtoClass>(schema: T, data: unknown, options?: ToDtoOptions): ToDtoResult<T> => runToDto(schema, data, combineOptions(prevOptions, options)),
    {
      with: (options: ToDtoOptions | Preprocessor) => getToDto(combineOptions(prevOptions, typeof options === 'function' ? { preprocessors: [options] } : options)),
    },
  );

export const toDto = getToDto();
