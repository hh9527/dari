/** 收窄成"非 null、非数组的对象"（JSON 边界用）。 */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** 收窄成数组（JSON 边界用；不引入 any）。 */
export const isArray = (value: unknown): value is unknown[] => Array.isArray(value);
