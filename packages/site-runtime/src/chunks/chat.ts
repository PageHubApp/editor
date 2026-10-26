import type { RuntimeConfig } from "../config";
import { set } from "../state-store";

type Turn = { id: string; role: string; content: string };
type History = { available?: boolean; ended?: boolean; branding?: { assistantName?: string; greeting?: string; accentColor?: string }; turns?: Turn[] } | null;

const FAILED = "Your message didn't send. Check your connection and try again.";
const RATE_LIMITED = "You're sending messages quickly. Wait a minute, then try again.";
const REPLY_FAILED = "The assistant couldn't answer that just now. Try sending it again.";

/**
 * Per page (one `RuntimeConfig` per `start()`): the one history request every chat root shares, and the first root, which
 * answers a send that names no root (a "Chat with us" button elsewhere on the page).
 */
const pages = new WeakMap<RuntimeConfig, { history?: Promise<History>; first?: Element }>();

/**
 * `data-chat` on a root (`id` = its state key prefix): the site chat widget. It asks `chat.api` (`/api/site-chat/<siteId>`)
 * for `/history`, un-hides itself and its `[data-chat-bubble]` when chat is on, then streams each `/message` reply over SSE.
 * It writes `<id>:available|ended|sending|rehydrating|hasError|hasTurns|error|streamingText|assistantName|accentColor`
 * (`on` or empty) for `data-state-show` / `data-state-text` to read, and draws the turns into `[data-chat-turns]` by cloning
 * its `<template data-chat-role="user|assistant">` rows (their `[data-turn-text]` takes the message).
 */
function widget(root: HTMLElement, cfg: RuntimeConfig) {
  const doc = root.ownerDocument;
  const api = cfg.chat?.api;
  const key = root.id;
  if (!api || !key) return;
  const page = pages.get(cfg) ?? pages.set(cfg, {}).get(cfg)!;
  page.first ??= root;
  const list = root.querySelector("[data-chat-turns]") as HTMLElement | null;
  let turns: Turn[] = [];
  let name = "Assistant", greeting = "", accent = "", error = "", live = "";
  let avail = false, ended = false, sending = false, loading = true;
  let rows: Element[] = [];
  let sig = "";
  let n = 0;

  const paint = () => {
    const all = turns.slice();
    if (!all.length && greeting && !loading) all.push({ id: "g", role: "assistant", content: greeting });
    if (sending) all.push({ id: "s", role: "assistant", content: live });
    const on = (v: unknown) => (v ? "on" : "");
    const values: Record<string, string> = {
      available: on(avail), ended: on(ended), sending: on(sending), rehydrating: on(loading), hasError: on(error),
      hasTurns: on(all.length), error, streamingText: live, assistantName: name, accentColor: accent,
    };
    for (const k in values) set(key + ":" + k, values[k]);
    root.querySelectorAll("textarea,input,[data-chat-send]").forEach((c) => ((c as HTMLInputElement).disabled = ended || (sending && c.hasAttribute("data-chat-send"))));
    if (!list) return;
    const fill = (el: Element | undefined, t: Turn) => el?.querySelectorAll("[data-turn-text]").forEach((s) => (s.textContent = t.content));
    const next = all.map((t) => t.id + t.role).join();
    if (next === sig) fill(rows[rows.length - 1], all[all.length - 1]!); // a streamed word: only the last row changes
    else {
      sig = next;
      rows.forEach((r) => r.remove());
      rows = [];
      for (const t of all) {
        const tpl = list.querySelector(`template[data-chat-role="${t.role}"]`) as HTMLTemplateElement | null;
        const row = (tpl?.content.cloneNode(true) as DocumentFragment | undefined)?.firstElementChild;
        if (!row) continue;
        fill(row, t);
        list.append(row);
        rows.push(row);
      }
    }
    list.scrollTop = list.scrollHeight;
  };

  async function send(text: string) {
    text = text.trim();
    if (!text || sending || ended || loading || !avail) return;
    turns.push({ id: "u" + ++n, role: "user", content: text });
    sending = true;
    live = error = "";
    paint();
    let note: string | null = null;
    try {
      const res = await fetch(api + "/message", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, pagePath: doc.defaultView!.location.pathname }),
      });
      if (!res.ok || !res.body) throw { status: res.status };
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      const frame = (f: string) => {
        const m = /^\s*data:\s*([\s\S]*)$/.exec(f);
        let e: any;
        try {
          e = m && JSON.parse(m[1]!);
        } catch {
          return;
        }
        if (!e) return;
        if (e.type === "meta" && e.assistantName) name = e.assistantName;
        else if (e.type === "text_delta") live += e.text;
        else if (e.type === "ended") note = e.text;
        else if (e.type === "error") error = REPLY_FAILED;
        else if (e.type === "done") {
          const reply = note ?? live;
          if (reply) turns.push({ id: "a" + ++n, role: "assistant", content: reply });
          if (note !== null) ended = true;
          live = "";
        }
        paint();
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop()!;
        parts.forEach(frame);
      }
    } catch (e: any) {
      error = e?.status === 429 ? RATE_LIMITED : FAILED;
    }
    sending = false;
    live = "";
    paint();
  }

  const event = cfg.chat?.event || "site:chat";
  doc.addEventListener(event, (e) => {
    const d = (e as CustomEvent).detail ?? {};
    if (!root.isConnected || (d.chat ? d.chat !== root : page.first !== root)) return;
    if (d.open) try { (root.closest("[popover]") as any)?.showPopover?.(); } catch { /* already open */ }
    void send(String(d.text ?? ""));
  });
  // Enter sends (the composer's textarea has no inline handler); Shift+Enter is a new line.
  root.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && (e.target as Element).tagName === "TEXTAREA") {
      e.preventDefault();
      (root.querySelector("[data-chat-send]") as HTMLElement | null)?.click();
    }
  });

  // Editing canvas (`data-ph-edit`): the shell is always shown (and its panel opened), so it can be selected and edited; no history request.
  if (doc.documentElement.hasAttribute("data-ph-edit")) {
    loading = false;
    root.hidden = false;
    root.closest("[data-chat-bubble]")?.removeAttribute("hidden");
    try {
      (root.closest("[popover]") as any)?.showPopover?.();
    } catch {
      /* already open, or no popover support */
    }
    return paint();
  }

  paint();
  page.history ??= fetch(api + "/history", { credentials: "same-origin" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  page.history.then((d) => {
    loading = false;
    if (d?.available) {
      avail = true;
      ended = !!d.ended;
      name = d.branding?.assistantName || name;
      greeting = d.branding?.greeting || "";
      accent = d.branding?.accentColor || "";
      turns = [...(d.turns ?? [])];
      root.hidden = false;
      root.closest("[data-chat-bubble]")?.removeAttribute("hidden");
    }
    paint();
  });
}

/**
 * `data-chat-send="field-name"` on a button or form: sends that field's value (or the element's text when no field is named
 * or it is empty) to the site chat widget, which listens for the `chat.event` event (default `site:chat`) on `document` (`detail: { text, open: true }`,
 * plus `chat: <root>` when the sender sits inside a `[data-chat]` widget). `data-chat` on a root is the widget itself.
 */
export function mount(el: Element, cfg?: RuntimeConfig) {
  if (el.hasAttribute("data-chat")) return cfg && widget(el as HTMLElement, cfg);
  const doc = el.ownerDocument;
  const name = el.getAttribute("data-chat-send") || "";
  const isForm = el instanceof (doc.defaultView as any).HTMLFormElement;
  const send = (e: Event) => {
    e.preventDefault();
    const scope: ParentNode = isForm ? el : el.closest("form") ?? el.closest("[data-chat]") ?? doc;
    const field = name ? (scope.querySelector(`[name="${CSS.escape(name)}"]`) as HTMLInputElement | null) : null;
    const text = (field?.value ?? "").trim() || (isForm ? "" : (el.textContent ?? "").trim());
    if (!text) return;
    const chat = el.closest("[data-chat]");
    doc.dispatchEvent(new (doc.defaultView as any).CustomEvent(cfg?.chat?.event || "site:chat", { detail: { text, open: true, ...(chat && { chat }) } }));
    if (field) field.value = "";
  };
  el.addEventListener(isForm ? "submit" : "click", send);
}
