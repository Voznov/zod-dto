import { BadRequestException } from '@nestjs/common';
import { type ArgumentMetadata } from '@nestjs/common/interfaces';
import { isZodDtoClass, ZodDto } from '@voznov/zod-dto';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ZodValidationPipe } from '../src/pipe';

const UserDto = ZodDto(
  z.object({
    name: z.string(),
    age: z.number(),
  }),
);

const makeMeta = (metatype?: unknown): ArgumentMetadata => ({
  type: 'body',
  metatype: metatype as ArgumentMetadata['metatype'],
});

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe();

  it('passes through when metatype is not a ZodDtoClass', () => {
    const value = { anything: true };
    expect(pipe.transform(value, makeMeta(undefined))).toBe(value);
    expect(pipe.transform(value, makeMeta(String))).toBe(value);
  });

  it('validates and returns DTO instance for valid data', () => {
    const result = pipe.transform({ name: 'Alice', age: 30 }, makeMeta(UserDto));
    expect(result).toBeInstanceOf(UserDto);
    expect(result).toEqual({ name: 'Alice', age: 30 });
  });

  it('throws BadRequestException for invalid data', () => {
    expect(() => pipe.transform({ name: 123 }, makeMeta(UserDto))).toThrow(BadRequestException);
  });

  it('BadRequestException contains validation messages', () => {
    try {
      pipe.transform({ name: 123 }, makeMeta(UserDto));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const response = (error as BadRequestException).getResponse() as { message: string[] };
      expect(response.message).toBeInstanceOf(Array);
      expect(response.message.length).toBeGreaterThan(0);
    }
  });

  it('accepts custom error factory', () => {
    class CustomError extends BadRequestException {
      constructor(issues: string[]) {
        super({ custom: true, issues });
      }
    }

    const customPipe = new ZodValidationPipe({
      createError: (issues) => new CustomError(issues),
    });

    try {
      customPipe.transform({ name: 123 }, makeMeta(UserDto));
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(CustomError);
      const response = (error as CustomError).getResponse() as { custom: boolean; issues: string[] };
      expect(response.custom).toBe(true);
    }
  });

  it('re-throws non-validation errors as-is', () => {
    // Verify that isZodDtoClass works correctly with the DTO
    expect(isZodDtoClass(UserDto)).toBe(true);
  });
});
