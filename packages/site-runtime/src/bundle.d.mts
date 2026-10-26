/** The runtime and every chunk as one self-contained browser module (source text). Node only; needs `esbuild`. */
export function bundleInline(options?: { minify?: boolean }): Promise<string>;
