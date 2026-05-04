import { registerOnCreate } from '@voznov/zod-dto';
import { applySwaggerDecorators } from './swagger';

// Deferred to a microtask so self-referential DTOs (`lazyDto<X>(() => X)`) resolve past TDZ.
registerOnCreate((dto) => void Promise.resolve().then(() => applySwaggerDecorators(dto)));

export { ZodValidationPipe } from './pipe';
export type { ZodValidationPipeOptions } from './pipe';
export { applySwaggerDecorators } from './swagger';
export { ZodSerialize, ZodResponse, ZodDtoSerializationError } from './zod-serialize';
export type { ZodResponseOptions } from './zod-serialize';
