/** 收窄成"非 null、非数组的对象"（JSON 边界用）。 */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** 收窄成数组（JSON 边界用；不引入 any）。 */
export const isArray = (value: unknown): value is unknown[] => Array.isArray(value);

/** Node 类型里没有 WebAssembly.Module 的构造与自定义段读取，这里声明用到的最小面。 */
export interface WasmModuleCtor {
  new (bytes: Uint8Array): unknown;
  customSections(module: unknown, sectionName: string): ArrayBuffer[];
}
export const wasmModule = (WebAssembly as unknown as { Module: WasmModuleCtor }).Module;
