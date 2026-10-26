/**
 * `{% javascript %}…{% endjavascript %}` — a section's or partial's own JavaScript, as on Shopify: the body is raw (no
 * Liquid runs inside it) and renders nothing in place. Every distinct block a page renders is collected and added ONCE,
 * in one `<script>` at the end of its `<body>` (`withPageScripts`), so a partial rendered ten times ships its code once.
 * Each block runs in its own function with its own `try`, so one that throws doesn't stop the rest.
 */
import { Tag, TokenKind, type Liquid, type Parser, type TagToken, type TopLevelToken } from "liquidjs";
import type { TagClass } from "../defineTag";

export function createJavascriptTag(scripts: Set<string>): TagClass {
  return class JavascriptTag extends Tag {
    private readonly code: string;
    constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, _parser?: Parser) {
      super(token, remainTokens, liquid);
      let code = "";
      while (remainTokens.length) {
        const t = remainTokens.shift()!;
        if (t.kind === TokenKind.Tag && (t as TagToken).name === `end${token.name}`) {
          this.code = code.trim();
          return;
        }
        code += t.getText();
      }
      throw new Error(`tag ${token.getText()} not closed`);
    }

    render(): void {
      if (this.code) scripts.add(this.code);
    }
  } as unknown as TagClass;
}

/** `</script` inside code would end the element early; `<\/script` is the same string to the JS parser. */
const SCRIPT_END = /<\/(script)/gi;

/** `html` with the collected `{% javascript %}` blocks in one `<script>` just before `</body>` (or at the end). */
export function withPageScripts(html: string, scripts: ReadonlySet<string>, nonce?: string): string {
  if (!scripts.size) return html;
  if (nonce !== undefined && !/^[A-Za-z0-9+/=_-]+$/.test(nonce)) throw new Error("invalid CSP nonce");
  const body = [...scripts].map((code) => `(function(){try{\n${code.replace(SCRIPT_END, "<\\/$1")}\n}catch(e){console.error(e)}})();`).join("\n");
  const tag = `<script data-ph-javascript${nonce ? ` nonce="${nonce}"` : ""}>\n${body}\n</script>`;
  const at = html.search(/<\/body\s*>(?![\s\S]*<\/body\s*>)/i);
  return at === -1 ? html + tag : html.slice(0, at) + tag + html.slice(at);
}
