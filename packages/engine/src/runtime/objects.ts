/** The Liquid objects the renderer itself provides; a data source can't take one of these names. */
export const BUILTIN_OBJECTS = ["site", "page", "pages", "request", "routes"] as const;

/** Names a data source's `liquid.global` may not use: the built-in objects plus tag-scoped variables. */
export const RESERVED_NAMES: ReadonlySet<string> = new Set<string>([...BUILTIN_OBJECTS, "section", "form", "paginate", "forloop", "tablerowloop"]);
