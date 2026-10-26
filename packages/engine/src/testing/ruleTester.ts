/**
 * `RuleTester.run(rule, { valid, invalid })`, ESLint's shape. A valid case produces no report from
 * this rule; an invalid case lists the expected reports (a count, or `{ message?, text?, severity? }`
 * checked in source order), the text after applying all of the rule's fixes (`output`; `null` =
 * the rule offers no fix), and optionally the suggestions' results. Every fix output must still
 * parse strict. Other rules never run, so a case tests exactly one rule.
 */
import assert from "node:assert/strict";
import { applySplices } from "../edit/ops";
import { parseSource } from "../parse/parse";
import type { Rule, RuleRegistry, Severity } from "../rules/defineRule";
import { applyFixes } from "../rules/fixer";
import { runRules, type Diagnostic, type RunOptions } from "../rules/run";

export interface RuleCaseBase {
  code: string;
  /** Path of `code` in the bundle; default `page.html`. */
  path?: string;
  /** Other files of the bundle (for rules that read it). */
  files?: Record<string, string>;
  options?: unknown;
  registry?: RuleRegistry;
  trustedFilters?: Iterable<string>;
  /** Name for failure messages. */
  name?: string;
}

export interface ExpectedError {
  message?: string | RegExp;
  /** The exact source text the report's range covers. */
  text?: string;
  severity?: Severity;
}

export interface InvalidCase extends RuleCaseBase {
  errors: number | ExpectedError[];
  /** Text after applying every fix once; `null`: no report carries a fix. Omit to not check. */
  output?: string | null;
  /** Per error index: the text after applying each suggestion. */
  suggestions?: Array<string[] | undefined>;
}

export interface RuleTests {
  valid: Array<string | RuleCaseBase>;
  invalid: InvalidCase[];
}

function diagnose(rule: Rule<any>, c: RuleCaseBase): Diagnostic[] {
  const path = c.path ?? "page.html";
  const opts: RunOptions = {
    registry: c.registry,
    trustedFilters: c.trustedFilters,
    options: c.options === undefined ? undefined : { [rule.meta.id]: c.options },
    files: c.files,
  };
  return runRules([rule], { [path]: c.code }, opts, [path]);
}

const label = (rule: Rule<any>, c: RuleCaseBase, i: number, kind: string) => `${rule.meta.id} ${kind}[${i}]${c.name ? ` (${c.name})` : ""}`;

export const RuleTester = {
  run(rule: Rule<any>, tests: RuleTests): void {
    tests.valid.forEach((v, i) => {
      const c = typeof v === "string" ? { code: v } : v;
      const got = diagnose(rule, c);
      assert.deepEqual(got.map((d) => d.message), [], `${label(rule, c, i, "valid")} reported`);
    });
    tests.invalid.forEach((c, i) => {
      const where = label(rule, c, i, "invalid");
      const got = diagnose(rule, c);
      const expected = typeof c.errors === "number" ? null : c.errors;
      assert.equal(got.length, typeof c.errors === "number" ? c.errors : c.errors.length, `${where}: report count (${got.map((d) => d.message).join(" | ")})`);
      expected?.forEach((e, j) => {
        const d = got[j]!;
        if (e.message !== undefined) {
          if (typeof e.message === "string") assert.equal(d.message, e.message, `${where} error ${j}: message`);
          else assert.match(d.message, e.message, `${where} error ${j}: message`);
        }
        if (e.text !== undefined) assert.equal(c.code.slice(d.range.start, d.range.end), e.text, `${where} error ${j}: range text`);
        if (e.severity !== undefined) assert.equal(d.severity, e.severity, `${where} error ${j}: severity`);
      });
      for (const d of got) assert.ok(d.range.start >= 0 && d.range.end <= c.code.length && d.range.start <= d.range.end, `${where}: range inside the source`);
      if (c.output !== undefined) {
        if (c.output === null) assert.ok(got.every((d) => !d.fix), `${where}: expected no fix`);
        else {
          const out = applyFixes(c.code, got).output;
          assert.equal(out, c.output, `${where}: fix output`);
          parseSource(out, "strict");
        }
      }
      c.suggestions?.forEach((outs, j) => {
        if (!outs) return;
        const sug = got[j]!.suggestions ?? [];
        assert.deepEqual(sug.map((s) => applySplices(c.code, s.splices)), outs, `${where} error ${j}: suggestions`);
      });
    });
  },
};
