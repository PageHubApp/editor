/**
 * Parser-side tag registration. A block tag the parser doesn't know (`{% map %}…{% endmap %}`)
 * parses in strict mode as a flat tag with its body as loose siblings — no error. So every
 * custom tag is registered here too, not just in liquidjs.
 *
 * `Environment` isn't exported from the parser's root (2.10.2); the deep import is pinned
 * with the parser version. Each site gets its own environment seeded with Shopify's
 * built-ins — never `Environment.default()`, which is shared by every caller in the process.
 */
import { builtinTags } from "@shopify/liquid-html-parser";
import { Environment } from "@shopify/liquid-html-parser/dist/environment.js";

/** Built-in parser definitions a custom tag can copy: block with named args, hybrid with a name + args, tag, raw. */
export type ParseLike = "form" | "section" | "render" | "raw";

export interface ParserTag {
  name: string;
  parseLike: ParseLike;
}

export function createParserEnvironment(tags: readonly ParserTag[] = []): Environment {
  const env = new Environment(builtinTags);
  for (const tag of tags) {
    const def = env.tagForName(tag.parseLike);
    if (!def) throw new Error(`parser has no built-in definition for "${tag.parseLike}"`);
    env.registerTag(tag.name, { ...def });
  }
  return env;
}

export type { Environment };
