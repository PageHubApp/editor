/**
 * The notice (`noticeOf(state)`), bottom-centre over the canvas column: a pill with the message,
 * up to two actions and a close button. It is an absolutely placed overlay (the live region is
 * always mounted, so nothing shifts and screen readers hear each new message). It hides itself
 * after `NOTICE_MS`; the countdown pauses while the pointer or focus is inside and restarts for
 * every new notice. An action runs, then closes the notice.
 */
import { useEffect, useRef, useState } from "react";
import { useEditorState, useEditorStore } from "../../react/bindings";
import { Icon } from "../../primitives/icons";
import { tooltip } from "../../primitives/tooltip";
import { Z_NOTICE } from "../../primitives/zIndex";
import { NOTICE_MS, noticeOf, type NoticeAction } from "./noticeState";

const ACTION = "hover:bg-base-200 text-primary shrink-0 cursor-pointer rounded-md px-2 py-1 text-xs font-semibold";

export function NoticeHost() {
  const store = useEditorStore();
  const notice = useEditorState(noticeOf);
  const id = notice?.id;
  // the notice the pointer / focus is in (by id, so a notice that closes under the pointer doesn't hold the next one)
  const [heldId, setHeldId] = useState<number | null>(null);
  const held = id !== undefined && heldId === id;
  const setHeld = (on: boolean) => setHeldId(on ? (id ?? null) : null);
  const left = useRef(NOTICE_MS);

  useEffect(() => void (left.current = NOTICE_MS), [id]);
  useEffect(() => {
    if (id === undefined || held) return;
    const started = Date.now();
    const t = setTimeout(() => {
      if (noticeOf(store.state)?.id === id) store.run("notice.dismiss");
    }, left.current);
    return () => {
      clearTimeout(t);
      left.current = Math.max(0, left.current - (Date.now() - started));
    };
  }, [id, held, store]);

  const act = (a: NoticeAction) => {
    store.run("notice.dismiss");
    a.run(store);
  };

  return (
    <div role="status" aria-live="polite" data-notice-region="" className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4" style={{ zIndex: Z_NOTICE }}>
      {notice && (
        <div
          key={notice.id}
          data-notice={notice.tone}
          onMouseEnter={() => setHeld(true)}
          onMouseLeave={() => setHeld(false)}
          onFocus={() => setHeld(true)}
          onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setHeld(false)}
          className="border-base-300 bg-base-100 text-base-content pointer-events-auto flex max-w-full items-center gap-1 rounded-lg border py-1 pr-1 pl-3 text-sm shadow-lg"
        >
          {notice.tone === "error" && <span className="text-error shrink-0"><Icon name="alert-triangle" className="size-4" /></span>}
          <span data-notice-message="" className="min-w-0 truncate px-1">{notice.message}</span>
          {notice.actions.map((a) => (
            <button key={a.label} type="button" data-notice-action={a.label} className={ACTION} onClick={() => act(a)}>
              {a.label}
            </button>
          ))}
          <button type="button" data-notice-close="" aria-label="Dismiss" {...tooltip("Dismiss", "top")} className="text-base-content/60 hover:bg-base-200 hover:text-base-content shrink-0 cursor-pointer rounded-md p-1" onClick={() => store.run("notice.dismiss")}>
            <Icon name="x" className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
