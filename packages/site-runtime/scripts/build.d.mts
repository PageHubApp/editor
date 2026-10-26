export interface RuntimeManifest {
  version: string;
  files: Array<{ path: string; bytes: number; sha256: string }>;
}
/** Build the runtime into `outdir` (default `dist`) and return the manifest it wrote. */
export function buildRuntime(outdir?: string): Promise<RuntimeManifest>;
