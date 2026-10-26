/**
 * `{% form 'contact', class: "x" %}…{% endform %}` — Shopify's form tag.
 *
 * Emits `<form method="post" action="<request.path>">` plus a hidden `form_type`. When the
 * request is a POST whose `request.form.form_type` equals the form name, the host's
 * `FormHandler` runs and the body sees:
 *   form.posted_successfully?  true after an accepted submit
 *   form.errors                [{ field?, message }] after a refused submit, else nil (so `{% if form.errors %}` works)
 *   form.values                the posted values (to refill fields)
 *   form.name
 * A handler that returns `null` says the post was for another form of the same name (told apart by `submission.attrs`,
 * the tag's `data-*` arguments): this one renders as if nothing was posted.
 * `class`, `id`, `action` and `data-*` arguments become attributes; others are ignored.
 */
import { Hash, evalToken, type Context, type Emitter, type Liquid, type Parser, type TagToken, type TopLevelToken } from "liquidjs";
import { BlockTag } from "./blockTag";
import { attrString, escapeHtml } from "../escape";

export interface FormError {
  field?: string;
  message: string;
}
/** `null`: the post was for another form that shares this one's name; this one renders as if nothing was posted. */
export type FormResult = { ok: true } | { ok: false; errors: FormError[] } | null;
export interface FormSubmission {
  name: string;
  values: Record<string, string>;
  /** The tag's `data-*` arguments (a host tells two forms of one name apart by them). Absent when there are none. */
  attrs?: Record<string, string>;
}
/** Host callback: validate / deliver a submission. Throwing is a render error. */
export type FormHandler = (submission: FormSubmission) => FormResult | Promise<FormResult>;

type Token = Parameters<typeof evalToken>[0];

export function createFormTag(handler: FormHandler): typeof BlockTag {
  return class FormTag extends BlockTag {
    private readonly nameToken: Token;
    private readonly hash: Hash;

    constructor(token: TagToken, remainTokens: TopLevelToken[], liquid: Liquid, parser?: Parser) {
      super(token, remainTokens, liquid, parser);
      const name = this.tokenizer.readValue();
      if (!name) throw new Error(`expected "form '<name>'": ${token.getText()}`);
      this.nameToken = name as Token;
      this.hash = new Hash(this.tokenizer.remaining());
    }

    *render(ctx: Context, emitter: Emitter): Generator<unknown, void, unknown> {
      const name = String(yield evalToken(this.nameToken, ctx));
      const opts = (yield this.hash.render(ctx)) as Record<string, unknown>;
      const request = (ctx.getSync(["request"]) ?? {}) as { path?: string; method?: string; form?: Record<string, unknown> };
      let values: Record<string, string> = {};
      for (const [k, v] of Object.entries(request.form ?? {})) values[k] = String(v ?? "");
      let posted = false;
      let errors: FormError[] = [];
      if (String(request.method ?? "").toUpperCase() === "POST" && values.form_type === name) {
        const data = Object.fromEntries(Object.entries(opts).filter(([k]) => k.startsWith("data-")).map(([k, v]) => [k, String(v ?? "")]));
        const r = (yield Promise.resolve(handler({ name, values, ...(Object.keys(data).length ? { attrs: data } : {}) }))) as FormResult;
        if (r?.ok) posted = true;
        else if (r) errors = r.errors;
        else values = {}; // another form's post: nothing of it shows here
      }
      const attrs: Record<string, unknown> = { method: "post", action: opts.action ?? request.path ?? "" };
      for (const [k, v] of Object.entries(opts)) if (k === "class" || k === "id" || k.startsWith("data-")) attrs[k] = v;
      emitter.write(`<form${attrString(attrs)}><input type="hidden" name="form_type" value="${escapeHtml(name)}">`);
      // Shopify's `form.errors` is nil unless the post failed: `{% if form.errors %}` must not be true for an empty list.
      ctx.push({ form: { name, "posted_successfully?": posted, errors: errors.length ? errors : null, values } });
      try {
        yield this.renderBody(ctx, emitter);
      } finally {
        ctx.pop();
      }
      emitter.write("</form>");
    }
  };
}
