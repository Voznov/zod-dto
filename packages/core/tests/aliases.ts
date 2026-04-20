export const aliases =
  (map: Record<string, string>) =>
  (data: unknown): unknown => {
    if (typeof data !== 'object' || data === null) return data;
    const result = { ...data } as Record<string, unknown>;
    for (const [from, to] of Object.entries(map)) {
      if (from in result) {
        if (!(to in result)) {
          result[to] = result[from];
        }
        delete result[from];
      }
    }

    return result;
  };
