/**
 * TextTopControls — the controls above the sections when a text leaf (h1-h6, p, span, …) is
 * inspected: a **Sample** generator
 * (three lengths — word, sentence, paragraph — written through `text.setInner`), a **Format**
 * Rich / Inline toggle (the rich-text profile, carried by the tag: a block `p` for Rich, inline
 * `span` for Inline — the property map's "implied by the tag" richText), an **Edit HTML**
 * button that opens the source in the shared CodeEditor, and an **Edit with AI** button that is a
 * host-injected slot: it renders only when the host registered an AI command (`aiChatFacet`, the
 * same signal the context menu's "Include in chat" row reads). With no host AI — the standalone
 * and the demo — nothing renders in its place, so there is never a dead disabled button and the
 * row simply shows Edit HTML full-width.
 *
 *   {isRichTextLeaf(handle) && <TextTopControls handle={handle} />}
 */
import { closeHistoryGroup, commandsFacet, type NodeHandle } from "@pagehub/engine";
import { useEditorStore, useRunCommand } from "../../react/bindings";
import { Chip } from "../../primitives/Chip";
import { Icon, type IconName } from "../../primitives/icons";
import { tooltip } from "../../primitives/tooltip";
import { useLiveTag } from "./controls/element/elementControlShared";
import { useAiChatCommand } from "../menus/aiChat";
import { ToolbarSegmentedControl } from "../toolbar/primitives/ToolbarSegmentedControl";

/** Sample lengths the generator writes (word / sentence / paragraph), with the icon shown. */
const SAMPLES: ReadonlyArray<{ id: string; icon: IconName; label: string; text: string }> = [
  { id: "word", icon: "letter-a", label: "Word", text: "A fresh headline" },
  { id: "sentence", icon: "minus", label: "Sentence", text: "A short sentence of placeholder copy you can replace with your own words." },
  {
    id: "paragraph",
    icon: "align-left",
    label: "Paragraph",
    text: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Praesent commodo cursus magna, vel scelerisque nisl consectetur et. Donec id elit non mi porta gravida at eget metus.",
  },
];

/** The shared full-width action button (Edit HTML, Edit with AI). */
const ACTION_BUTTON =
  "border-base-300 bg-base-100 text-base-content hover:border-base-content/30 hover:bg-base-content/[0.03] flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors";

type Mode = "full" | "inline";

/** Tags that carry the full (block) rich-text profile; everything else is inline. */
const FULL_TAGS = new Set(["p", "div"]);

export function TextTopControls({ handle }: { handle: NodeHandle }) {
  const run = useRunCommand();
  const store = useEditorStore();
  // The host's AI command id, or null. A host fills it; the standalone/demo leaves it empty, so
  // the "Edit with AI" button simply does not render.
  const aiCommand = useAiChatCommand();
  // live tag, re-read whenever the file changes (the Format toggle renames it; handle.tag is fixed at
  // construction, so read the current tree node instead)
  const tag = useLiveTag(handle);
  const mode: Mode = FULL_TAGS.has(tag) ? "full" : "inline";
  const aiReady = !!aiCommand && handle.alive && store.state.facet(commandsFacet).has(aiCommand);

  const sample = (text: string) => run("text.setInner", { target: handle, source: text });

  const setFormat = (next: Mode) => {
    if (next === mode || !handle.alive || handle.kind !== "element") return;
    // a targeted tag-name splice (the same path `text.setTag` uses) remaps the selection handle,
    // so the breadcrumb and this control follow — a whole-element `source.replace` would not
    const to = next === "full" ? "p" : "span";
    store.dispatch((tr) => tr.setTagName(handle, to));
    store.dispatch((tr) => tr.effect(closeHistoryGroup, null));
  };

  return (
    <div data-text-top-controls="" className="border-base-300 flex flex-col gap-2 border-b px-3 py-3">
      <Chip label="Sample" frame="bare">
        <div className="bg-neutral ml-auto flex w-fit shrink-0 items-center gap-1 rounded-md p-1" role="group" aria-label="Insert sample text">
          {SAMPLES.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-label={s.label}
              onClick={() => sample(s.text)}
              {...tooltip(s.label, "top")}
              data-sample={s.id}
              className="text-neutral-content hover:bg-base-100 hover:text-base-content flex h-6 items-center justify-center rounded px-2 transition-colors"
            >
              <Icon name={s.icon} className="size-3.5" />
            </button>
          ))}
        </div>
      </Chip>

      <Chip label="Format" frame="bare">
        <div className="min-w-0 flex-1">
          <ToolbarSegmentedControl<Mode>
            dense
            aria-label="Text format"
            value={mode}
            onChange={setFormat}
            options={[
              { value: "full", label: "Rich" },
              { value: "inline", label: "Inline" },
            ]}
          />
        </div>
      </Chip>

      <div className="flex w-full gap-2 [&>*]:flex-1">
        <button type="button" data-edit-html="" onClick={() => run("inspector.detail", { kind: "html" })} className={ACTION_BUTTON}>
          <Icon name="code" className="size-3.5" aria-hidden />
          Edit HTML
        </button>
        {aiReady && aiCommand ? (
          <button
            type="button"
            data-edit-ai=""
            onClick={() => store.run(aiCommand, { at: handle })}
            disabled={!store.can(aiCommand, { at: handle })}
            {...tooltip("Edit with AI", "top")}
            className={ACTION_BUTTON}
          >
            <Icon name="sparkles" className="size-3.5" aria-hidden />
            Edit with AI
          </button>
        ) : null}
      </div>
    </div>
  );
}
