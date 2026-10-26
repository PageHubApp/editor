/**
 * Media row: a thumbnail of the picked file (or "Pick media") that opens the `MediaManager`
 * slot in pick mode, with the extra sources "Site logo" (when the site has one) and "Dynamic"
 * (a Liquid expression such as `{{ product.image }}`). `value` is a media id or an expression.
 *
 *   <MediaInput label="Image" value={id} onChange={setId} siteLogo={{ light: "{{ company.logo }}" }} />
 */
import { useEffect, useState, type ReactNode } from "react";
import { mediaFacet, type MediaKind } from "@pagehub/engine/host";
import { Slot, useSlot } from "../../components";
import { useEditorState } from "../../react/bindings";
import type { MediaSource } from "./MediaManagerView";
import { PopoverChip } from "../../primitives/Chip";

interface MediaInputProps {
  label?: string;
  labelWidth?: string;
  adornment?: ReactNode;
  value: string;
  onChange(value: string): void;
  kindFilter?: MediaKind;
  /** Liquid expressions of the site logo (light, and for dark backgrounds). */
  siteLogo?: { light: string; dark?: string };
}

const isExpression = (v: string) => v.includes("{{");

function DynamicSource({ pick }: { pick(v: string): void }) {
  const [expr, setExpr] = useState("");
  return (
    <form className="flex flex-col gap-2 p-3" onSubmit={(e) => (e.preventDefault(), expr.trim() && pick(expr.trim()))}>
      <p className="text-neutral-content text-xs">Use a value from the page's data, like {"{{ product.image }}"}.</p>
      <input value={expr} onChange={(e) => setExpr(e.target.value)} placeholder="{{ product.image }}" aria-label="Dynamic value" className="border-base-300 bg-base-200 text-base-content h-8 rounded-md border px-2 font-mono text-xs" />
      <button type="submit" className="btn btn-primary btn-sm self-end" disabled={!expr.trim()}>Use value</button>
    </form>
  );
}

export function MediaInput({ label, labelWidth, adornment, value, onChange, kindFilter = "image", siteLogo }: MediaInputProps) {
  const [open, setOpen] = useState(false);
  // No MediaManager injected → there's nowhere to pick from, so the trigger stays inert (the
  // popover `Slot` renders nothing on its own, this just keeps the button from looking live).
  const hasManager = !!useSlot("MediaManager");
  const store = useEditorState((s) => s.facet(mediaFacet));
  const [item, setItem] = useState<{ url: string; name: string } | null>(null);
  useEffect(() => {
    if (!value || isExpression(value)) return void setItem(null);
    if (/^(https?:|\/|data:)/.test(value)) return void setItem({ url: value, name: value.split("/").pop()?.split("?")[0] || value });
    if (!store) return void setItem(null);
    let live = true;
    void Promise.resolve(store.list()).then((items) => {
      const hit = items.find((i) => i.id === value);
      if (live) setItem(hit ? { url: hit.url, name: hit.alt || hit.name } : null);
    });
    return () => void (live = false);
  }, [store, value]);
  const url = item?.url ?? null;
  // A bound value (`{{ item.image }}`) reads as a variable chip, not Liquid.
  const bound = isExpression(value) ? /\{\{\s*([\w.-]+)/.exec(value)?.[1] : undefined;

  const sources: MediaSource[] = [
    ...(siteLogo
      ? [
          {
            id: "logo",
            label: "Site logo",
            render: (pick: (v: string) => void) => (
              <div className="flex flex-col gap-2 p-3">
                <p className="text-neutral-content text-xs">Linked images change everywhere when you update your logo in Site settings.</p>
                {[{ k: "light", label: "Logo", v: siteLogo.light }, ...(siteLogo.dark ? [{ k: "dark", label: "Logo for dark backgrounds", v: siteLogo.dark }] : [])].map((o) => (
                  <button key={o.k} type="button" onClick={() => pick(o.v)} className="border-base-300 rounded-lg border p-2 text-left text-sm">
                    {o.label}
                  </button>
                ))}
              </div>
            ),
          },
        ]
      : []),
    { id: "dynamic", label: "Dynamic", render: (pick) => <DynamicSource pick={pick} /> },
  ];

  return (
    <>
      <PopoverChip
        label={label}
        labelWidth={labelWidth}
        adornment={adornment}
        open={open}
        onTriggerClick={() => hasManager && setOpen(true)}
        onClear={() => onChange("")}
        triggerAriaLabel={value ? "Change media" : "Pick media"}
        clearAriaLabel="Clear media"
        leading={url ? <img src={url} alt="" className="size-4 rounded-sm object-cover" /> : undefined}
        summary={
          !value ? (
            "Pick media"
          ) : bound ? (
            <span data-media-bound="" className="bg-primary/10 text-primary rounded px-1.5 py-0.5 font-mono text-[11px]">
              {bound}
            </span>
          ) : (
            (item?.name ?? value)
          )
        }
      />
      <Slot name="MediaManager" open={open} onClose={() => setOpen(false)} onPick={onChange} kindFilter={kindFilter} sources={sources} />
    </>
  );
}
