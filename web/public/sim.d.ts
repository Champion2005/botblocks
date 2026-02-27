/* tslint:disable */
/* eslint-disable */

export function mock_http_request(method: string, path: string, body: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly mock_http_request: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number];
    readonly main: (a: number, b: number) => number;
    readonly wasm_bindgen__closure__destroy__h17dcba0968d240a8: (a: number, b: number) => void;
    readonly wasm_bindgen__closure__destroy__h140a74e80b172f17: (a: number, b: number) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h0388b93ae12629e8: (a: number, b: number, c: any, d: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h5ace799da973799d: (a: number, b: number, c: any) => [number, number];
    readonly wasm_bindgen__convert__closures_____invoke__h4f1acc447fa8cdd0: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h4f1acc447fa8cdd0_2: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h4f1acc447fa8cdd0_3: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h4f1acc447fa8cdd0_4: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h4f1acc447fa8cdd0_5: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h4f1acc447fa8cdd0_6: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h4f1acc447fa8cdd0_7: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h4f1acc447fa8cdd0_8: (a: number, b: number, c: any) => void;
    readonly wasm_bindgen__convert__closures_____invoke__hc685438b64fadf4f: (a: number, b: number, c: number) => void;
    readonly wasm_bindgen__convert__closures_____invoke__h2f4780f4dc5bd85e: (a: number, b: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
