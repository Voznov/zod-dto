import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { type ArgumentMetadata } from '@nestjs/common/interfaces';
import { isZodDtoClass, toDto, ZodDtoValidationError } from '@voznov/zod-dto';

export interface ZodValidationPipeOptions {
  createError?: (issues: string[]) => Error;
}

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  private readonly createError: (issues: string[]) => Error;

  constructor(options?: ZodValidationPipeOptions) {
    this.createError = options?.createError ?? ((issues) => new BadRequestException(issues));
  }

  transform(value: unknown, { metatype }: ArgumentMetadata): unknown {
    if (!metatype || !isZodDtoClass(metatype)) {
      return value;
    }

    try {
      return toDto(metatype, value);
    } catch (error) {
      if (error instanceof ZodDtoValidationError) {
        throw this.createError(error.issues);
      }
      throw error;
    }
  }
}
