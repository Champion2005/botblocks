declare module 'virtual:pyodide-files' {
  export function setupPyodideFiles(pyodide: any): Promise<void>
  export function runEntryPoint(pyodide: any): void
  export function runEntryPointAsync(pyodide: any): Promise<void>
}