import { get, subscribe } from "../state-store";
import type { CartLine } from "./cart";

const cls = (el: Element, name: string) => el.getAttribute("data-" + name) || "";
function node<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const n = doc.createElement(tag);
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}

/**
 * `data-cart-items`: the drawer's list of lines, redrawn whenever `cart:items-json` changes. The empty copy is
 * `data-empty-text`; `data-*-class` styles each part. The quantity and remove buttons carry `data-cart-line`, which
 * the cart chunk's click handler acts on.
 */
export function mount(host: Element) {
  const doc = host.ownerDocument;
  let painted: string | undefined;
  const paint = () => {
    if (!host.isConnected) return unsubscribe();
    const json = get("cart:items-json") ?? "[]";
    if (json === painted) return;
    painted = json;
    let items: CartLine[] = [];
    try {
      items = JSON.parse(json);
    } catch {
      /* draw the empty cart */
    }
    if (!items.length) {
      const box = node(doc, "div", cls(host, "empty-class"));
      box.append(node(doc, "p", cls(host, "empty-text-class"), host.getAttribute("data-empty-text") ?? ""));
      return host.replaceChildren(box);
    }
    const list = node(doc, "div", cls(host, "list-class"));
    for (const l of items) {
      const row = node(doc, "div", cls(host, "row-class"));
      if (l.image) {
        const img = node(doc, "img", cls(host, "image-class"));
        img.src = l.image;
        img.alt = l.title;
        row.append(img);
      }
      const body = node(doc, "div", cls(host, "body-class"));
      body.append(node(doc, "p", cls(host, "title-class"), l.title));
      if (l.variantLabel) body.append(node(doc, "p", cls(host, "variant-class"), l.variantLabel));
      if (l.priceFormatted) body.append(node(doc, "p", cls(host, "price-class"), l.priceFormatted));
      const controls = node(doc, "div", cls(host, "controls-class"));
      const button = (action: string, label: string, className: string, aria: string) => {
        const b = node(doc, "button", className, label);
        b.type = "button";
        b.setAttribute("data-cart-line", action);
        b.setAttribute("data-cart-price-id", l.priceId);
        b.setAttribute("aria-label", aria);
        return b;
      };
      controls.append(
        button("dec", "\u2212", cls(host, "control-button-class"), "Decrease quantity"),
        node(doc, "span", cls(host, "quantity-class"), String(l.quantity)),
        button("inc", "+", cls(host, "control-button-class"), "Increase quantity"),
        button("remove", "\u00d7", cls(host, "remove-button-class"), "Remove"),
      );
      body.append(controls);
      row.append(body);
      list.append(row);
    }
    host.replaceChildren(list);
  };
  const unsubscribe = subscribe(paint);
  paint();
}
