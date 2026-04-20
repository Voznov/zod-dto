import { registerOnCreate } from '@voznov/zod-dto';
import { applySwaggerDecorators } from './swagger';

// Auto-register swagger decoration on every ZodDto() creation when this package is imported.
registerOnCreate(applySwaggerDecorators);

export { ZodValidationPipe } from './pipe';
export type { ZodValidationPipeOptions } from './pipe';
export { applySwaggerDecorators } from './swagger';
