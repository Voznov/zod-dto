import type { z } from 'zod';

export const formatZodIssues = (issues: z.core.$ZodIssue[]): string[] =>
  issues.map((issue) => {
    const path = issue.path.map((seg, i) => (typeof seg === 'number' ? `[${seg}]` : i === 0 ? String(seg) : `.${String(seg)}`)).join('');

    return path ? `${path}: ${issue.message}` : issue.message;
  });

const summarize = (issues: string[]): string => {
  if (issues.length === 0) return '0 issues';
  if (issues.length === 1) return `1 issue: "${issues[0]}"`;

  return `${issues.length} issues: "${issues[0]}" (+${issues.length - 1} more)`;
};

export class ZodDtoValidationError extends Error {
  public readonly issues: string[];

  constructor(issues: string[]) {
    super(summarize(issues));
    this.name = 'ZodDtoValidationError';
    this.issues = issues;
  }
}
