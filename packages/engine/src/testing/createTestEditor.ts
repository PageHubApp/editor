/**
 * `createTestEditor`: a synchronous editor over in-memory files for tests.
 * `get(selector, path?)` is the first match (throws when none), `text(path?)` a file's text,
 * `diff()` the unified diff since creation (for inline snapshots).
 */
import { Editor, type Role } from "../editor/createEditor";
import { memoryStorage, type MemoryStorage } from "../storage/memory";
import { unifiedDiff } from "../storage/diff";
import type { Extension } from "../extensions/extension";
import type { NodeHandle } from "../state/handles";
import type { Path } from "../state/changes";
import type { JsonValue } from "../runtime/tags/schema";
import type { UiContext } from "../commands/defineCommand";

export interface TestEditorOptions {
  files: Record<Path, string>;
  extensions?: Extension;
  data?: Record<string, JsonValue>;
  identity?: "session" | "persisted";
  role?: Role;
  mint?: () => string;
  ui?: UiContext;
}

export class TestEditor extends Editor {
  /** Texts right after creation (after persisted-id stamping). */
  private readonly initial: ReadonlyMap<Path, string>;
  readonly memory: MemoryStorage;

  constructor(opts: TestEditorOptions) {
    const memory = memoryStorage(opts.files);
    const files = new Map(Object.entries(opts.files));
    super({ files, versions: new Map([...files.keys()].map((p) => [p, "1"])), storage: memory }, { ...opts, dev: true });
    this.memory = memory;
    this.initial = new Map(this.state.files);
  }

  private get firstPath(): Path {
    return this.state.files.keys().next().value!;
  }

  /** First node matching `selector` (in `path`, default the first file); throws when none. */
  get(selector: string, path: Path = this.firstPath): NodeHandle {
    const h = this.find(path, selector)[0];
    if (!h) throw new Error(`no node matches "${selector}" in ${path}`);
    return h;
  }

  text(path: Path = this.firstPath): string {
    return this.state.files.get(path)!;
  }

  /** Unified diff of every file since creation. */
  diff(): string {
    return [...this.state.files]
      .map(([p, t]) => unifiedDiff(p, this.initial.get(p) ?? "", t))
      .filter(Boolean)
      .join("");
  }
}

export function createTestEditor(opts: TestEditorOptions): TestEditor {
  return new TestEditor(opts);
}
