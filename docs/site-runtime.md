# Site runtime attributes

Reference for every `data-*` attribute that [`@pagehub/site-runtime`](../packages/site-runtime) understands on a published page. For installing and loading the script, see the [package README](../packages/site-runtime/README.md).

The runtime is plain HTML attributes plus one small script. A page that uses none of them ships no JavaScript (`needsRuntime(html)` tells a publish step which pages need it).

## Configuration

The script reads an optional `<script type="application/json" id="runtime-config">` element. Nothing host-specific is defaulted, so the cart checkout URL, the cart storage key and the chat event all come from here.

```html
<script type="application/json" id="runtime-config">
  { "cart": { "api": "/api/checkout", "body": { "siteId": "abc" } }, "chunkBase": "/assets/runtime/1a2b3c/chunks/" }
</script>
```

| Key | What it does |
|---|---|
| `cart.api` | URL that checkout posts `{ ...cart.body, items, successUrl, cancelUrl, promotionCode }` to. It must return `{ url }`. |
| `cart.body` | Your own fields (a site id, a tenant) merged into that post. |
| `cart.endpoint` | Without `cart.api`: the page checkout goes to, with `?items=priceId:qty,...` (default `/checkout`). |
| `cart.key` | The localStorage key the cart lines live under (default `cart`). |
| `chat.event` | DOM event `data-chat-send` dispatches on `document` (default `site:chat`). |
| `chat.api` | The site-chat endpoint base (`/api/site-chat/<siteId>`) a `data-chat` widget calls `/history` and `/message` under. Without it a `data-chat` root stays hidden. |
| `map.leaflet`, `map.tiles`, `map.attribution` | Where Leaflet loads from (default: unpkg) and the default tiles for `{% map %}`. |
| `chunkBase` | Directory URL the lazy chunks are served from, ending in `/`. Defaults to `chunks/` next to the script. |

Hosts that run the script themselves can also pass adapters (`cart.adapter`, `track.adapters`, `map.leaflet.lib`) through `start(document, config)`, because JSON can't carry functions.

## Attributes

Add an attribute and the runtime loads the chunk that handles it. Each chunk loads once, the first time its attribute shows up, including on elements added later. Without JS the page still works; the attribute is just inert.

### Cart

`data-cart` on a button or form: `add`, `open` or `checkout`. Add reads `data-cart-item`, the product row's cart fields as JSON (`id`, `title`, `image`, `price` with `amount` / `formatted` / `currency`, `metadata.priceId`), or just `data-cart-id` or the form's `id` field. Quantity comes from the `data-cart-qty-field` input, the form's `quantity` field, `data-cart-qty`, or 1.

```html
<button data-cart="add" data-cart-id="tee-1" data-cart-qty="2">Add</button>
```

A product with options sets `hasMultipleVariants`, `optionNamesCsv` and `variantMapJson` in its item. `data-cart-variant-axes` names the state keys the option pickers write, `%axis%` standing for each axis name; the variant whose options match is the one added, and an incomplete pick sets `cart:error` instead.

```html
<button data-cart="add" data-cart-item='{"id":"p1","title":"Fern","price":{"amount":4500,"formatted":"$45.00","currency":"usd"},"metadata":{"priceId":"price_1"},"hasMultipleVariants":true,"optionNamesCsv":"Pot","variantMapJson":"[{\"option1\":\"Cream\",\"priceId\":\"price_2\",\"amount\":4500,\"formatted\":\"$45.00\"}]"}' data-cart-variant-axes="pdp:axis:%axis%" data-cart-qty-field="quantity">Add</button>
<button data-state-set="pdp:axis:Pot:Cream">Cream</button>
```

A form can build its line from its own fields: `data-cart-id-template` fills `{name}` with each field's value (an empty one sets `cart:error`). With `data-cart-then="checkout"` it goes straight to checkout instead of opening the cart, and its other fields (not `id` / `quantity`) travel with the order as its details. With PageHub's checkout, `pd:<rowId>/<field>=<from>..<to>` charges the row's list entries between two days (a stay's nights), or `=<key>,<key>` named entries.

```html
<form data-cart="add" data-cart-then="checkout" data-cart-id-template="pd:{{ item.id }}/calendar={checkIn}..{checkOut}">
  <input type="date" name="checkIn" required> <input type="date" name="checkOut" required>
  <input type="number" name="guests" min="1" value="2">
  <button>Book</button>
</form>
```

**Pay in the page.** Put an element with `data-cart-pay` inside a `<dialog>` and checkout shows Stripe's payment form there instead of sending the buyer to Stripe's page, on sites whose Stripe is connected through PageHub (others keep Stripe's page). The dialog opens on its own; closing it drops the form, and a paid order lands on the success page as usual. The checkout code and Stripe.js load only when a buyer checks out.

```html
<dialog id="pay" closedby="any" class="modal">
  <div class="modal-box max-w-xl"><div data-cart-pay></div></div>
</dialog>
```

**Pick dates on a calendar.** `data-date-range` (`data-date-range="<name>"`) on a calendar makes its days a range picker: tap check-in, then check-out. Days are `data-date="YYYY-MM-DD"` buttons with the night's `data-price` in minor units; a booked night carries `data-booked` and can only be the check-out day, and a stay that would cross one starts over at the tapped day. The picked days get `data-range="start|in|end"` (style them with `data-[range=in]:bg-primary/20` and the like), the dates fill the `checkIn` / `checkOut` inputs in the calendar's form (`data-date-range-in` / `-out` rename them), and the state keys `<name>:in`, `<name>:out`, `<name>:nights` and `<name>:total` (in `data-currency`, default usd) feed a summary. Months can be slides of a `data-carousel` with your own arrows. Stay rules are optional: a day's `data-min-stay` is the fewest nights from that check-in, `data-no-checkin` can't start a stay and `data-no-checkout` can't end one; a tap that breaks one sets `<name>:hint`. `data-fee` on the calendar (minor units) is added once to the total.

```html
<form data-cart="add" data-cart-then="checkout" data-cart-id-template="pd:{{ item.id }}/calendar={checkIn}..{checkOut}">
  <input type="hidden" name="checkIn"> <input type="hidden" name="checkOut">
  <div data-date-range="stay" data-currency="usd">
    <button type="button" data-date="2026-11-01" data-price="21000" class="data-[range=start]:bg-primary">1</button>
    <button type="button" data-date="2026-11-02" data-booked>2</button>
  </div>
  <p data-state-show="stay:out" hidden><span data-state-text="stay:nights"></span>, <span data-state-text="stay:total"></span></p>
  <button>Book</button>
</form>
```

`open` toggles the `cart:open` state key. The drawer panel and its backdrop are ordinary elements with `data-state-show="cart:open"` and `hidden`; a link with `data-cart="open"` on a page without one just follows its href. Adding to the cart opens it.

```html
<button data-cart="open">Cart</button>
<aside data-state-show="cart:open" hidden>…</aside>
```

`data-cart-items` is the drawer's list of lines (title, image, option, price, quantity buttons, remove). Its `data-empty-text` is the empty copy, and the `data-*-class` attributes (`empty-class`, `empty-text-class`, `list-class`, `row-class`, `image-class`, `body-class`, `title-class`, `variant-class`, `price-class`, `controls-class`, `quantity-class`, `control-button-class`, `remove-button-class`) style each part.

```html
<div data-cart-items data-empty-text="Your cart is empty" data-row-class="flex gap-4"></div>
```

`data-cart-count` shows the number of items in the cart. The cart is also published as the state keys `cart:count`, `cart:total` (the formatted subtotal, empty for an empty cart) and `cart:items-json`, so `data-state-text="cart:total"` and `data-state-show="cart:count>0"` work anywhere. `cart:error` holds the last failure and `cart:checkout-status` is `success` or `cancel` on the page checkout returns to.

```html
<span data-cart-count>0</span>
<p data-state-show="cart:count>0" hidden>Subtotal <span data-state-text="cart:total"></span></p>
```

`checkout` sends the lines to the checkout. With `cart.api` in `runtime-config` it posts `{ ...cart.body, items: [{ priceId, quantity }], successUrl, cancelUrl, promotionCode }` to that URL and follows the returned `url`; `cart:promo` supplies the promotion code. There is no default `api`: the host names its checkout endpoint (and puts its own fields, such as a site id, in `cart.body`). Without `cart.api` it goes to `cart.endpoint` (default `/checkout`) with `?items=priceId:qty,…`. The lines are stored in localStorage under `cart.key` (default `cart`). `data-cart-success` and `data-cart-cancel` are the site paths Stripe returns to. A paid return (`?checkout=success`) empties the cart.

```html
<button data-cart="checkout" data-cart-success="/order-confirmed">Checkout</button>
```

### Motion and scroll

`data-animate` plays a preset once when the element scrolls into view. Companions: `data-animate-trigger="load"`, `data-animate-stagger` on the parent, `data-animate-exit`.

Whatever is already on screen when the animate chunk loads is left as painted (marked `data-animated`, never hidden and replayed), and only then does `html[data-animate-ready]` let the stylesheet hide the rest, all of it off screen. `data-animate-trigger="load"` is the opt-in for animating something on the first screen: the stylesheet hides it from the first paint and the chunk plays it, with a 2s CSS fallback that shows it if the runtime never loads.

```html
<ul data-animate-stagger="80ms"><li data-animate="fade-up">One</li><li data-animate="fade-up">Two</li></ul>
```

`data-autoplay` on a scroll-snap track steps one item per tick and wraps at the end.

```html
<div data-autoplay="5s" class="snap-x overflow-x-auto"><img src="a.jpg" alt=""><img src="b.jpg" alt=""></div>
```

`data-carousel` on a scroll-snap track adds previous and next buttons and one dot per slide. Tokens: `dots`, `arrows`, `wrap` (loop past either end), `overlay` (the controls sit over the slides, arrows at the sides and dots along the bottom, light on a dark disc so they read on a photo; without it they're a bar under the track). Buttons you place in the track's parent as `data-carousel-prev`, `data-carousel-next` and one `data-carousel-dot` per slide are wired instead of generated; the current dot gets `aria-current="true"`. The generated nav (prev, dots, next) ships a default look as one `<style id="ph-carousel-style">` built from the theme tokens; every rule is in `:where()`, so any class of yours overrides it. Controls you place yourself are not styled.

```html
<div data-carousel="dots arrows" class="snap-x overflow-x-auto"><img src="a.jpg" alt=""><img src="b.jpg" alt=""></div>
```

`data-scroll-effect` on a section (section > pin > track) is `horizontal` or `timeline`. Options: `data-scroll-runway`, `data-scroll-speed`, `data-scroll-direction`. Timeline sets `--scroll-progress` (0 to 1).

```html
<section data-scroll-effect="horizontal" data-scroll-runway="3"><div><div>…slides…</div></div></section>
```

`data-scroll-smoothing` (0 to 1) eases the position toward its target. On a scroll-effect section it smooths the pan; on a plain scroll box it smooths the wheel.

```html
<div data-scroll-smoothing="0.15" class="overflow-y-auto">…</div>
```

`data-drag-scroll` lets a pointer drag scroll the box. It sets `data-dragging` while dragging.

```html
<div data-drag-scroll class="overflow-x-auto">…</div>
```

`data-wheel-horizontal` turns the vertical wheel into sideways scrolling.

```html
<div data-wheel-horizontal class="overflow-x-auto">…</div>
```

`data-scrollbar-autohide` sets `data-scrolling` while the box scrolls and for the given time after. CSS hides the scrollbar otherwise.

```html
<div data-scrollbar-autohide="1500ms" class="overflow-y-auto">…</div>
```

`data-scrollspy` on a nav marks the link whose `#target` is most visible with `aria-current="true"`.

```html
<nav data-scrollspy><a href="#intro">Intro</a><a href="#pricing">Pricing</a></nav>
```

`data-fit-text` picks the largest font size that fits. Modes: `oneline` (default), `boxoneline`, `box`, `multiline`. Limits: `data-fit-min`, `data-fit-max`.

```html
<h1 data-fit-text="oneline" data-fit-min="16" data-fit-max="200">Big headline</h1>
```

### Events, forms and links

`data-track` on a link, button or form fires `provider:event` on click or submit. Unknown providers do nothing.

```html
<a href="/contact" data-track="ga4:generate_lead">Contact</a>
```

`data-form-state` marks the children of a form shown for one state (`idle`, `sending`, `sent`, `error`). The form submits with fetch and swaps them in place. On a failed submit the `idle` fields stay visible with their values, the `error` slot shows (or a default message is added) and takes focus as an alert, and the form can be submitted again.

```html
<form method="post" action="/submit"><div data-form-state="idle">…fields…</div><p data-form-state="sent" hidden>Thanks.</p><p data-form-state="error" hidden>Could not send. Try again.</p></form>
```

`commandfor` on a button is the native invoker attribute. The runtime only adds a polyfill on browsers without it. On any other element (a card, a gallery tile) the runtime runs the command itself when the element, or something inside it, is clicked; an overlay that commands itself acts only on a click that lands on it, its backdrop. An element with content inside the overlay it names (a drawer or modal panel carrying its overlay's command) is ignored, so a click on blank panel space never closes it; a childless one (a click-away strip) still acts.

```html
<button commandfor="menu" command="show-popover">Menu</button>
```

`data-map` holds the map config as JSON; its `data-pin` and `data-route` children are the pins and routes. Leaflet loads when the map nears the viewport. Without JS the children are a readable list.

```html
<div data-map='{"zoom":14}'><address data-pin="34.05,-118.24"><strong>Shop</strong> 1 Main St</address></div>
```

`data-chat-send` on a button or form sends a field's value (or the element's text) to the site chat widget as a `document` event named `chat.event` in `runtime-config` (default `site:chat`, `detail: { text, open: true }`).

```html
<form data-chat-send="question"><input name="question"><button>Ask</button></form>
```

`data-chat` on a root (its `id` is the prefix of its state keys) is the chat widget itself. It stays `hidden` until `chat.api`'s `/history` says chat is on, then un-hides itself and its `[data-chat-bubble]` wrapper, and streams each reply from `/message`. It writes `<id>:available`, `:ended`, `:sending`, `:rehydrating`, `:hasError`, `:hasTurns`, `:error`, `:streamingText`, `:assistantName` and `:accentColor` to the state store, so `data-state-show` and `data-state-text` can gate and fill the rest of the panel. `[data-chat-turns]` holds one `<template data-chat-role="user">` and one `assistant` row; each message clones its role's row and fills the `data-turn-text` inside it. A `data-chat-send` inside the widget sends to it. Enter in its textarea sends.

```html
<div data-chat id="chat-1" hidden>
  <div data-state-show="chat-1:hasError" hidden><span data-state-text="chat-1:error"></span></div>
  <div data-chat-turns>
    <template data-chat-role="user"><p data-turn-text></p></template>
    <template data-chat-role="assistant"><p data-turn-text></p></template>
  </div>
  <textarea name="agentMessage"></textarea>
  <button data-chat-send="agentMessage">Send</button>
</div>
```

`data-on` calls functions the site registered with `PageHub.on(name, fn)`. Format: `event:name; event:name.once`. It never evaluates code.

```html
<button data-on="click:openChat">Chat</button>
```

`data-show-on` opens a show-hide target on `load` or `hover` (the native invoker only covers clicks). `data-show-target` is the element id (default: the element itself), `data-show-dir` is `show`, `hide` or `toggle`, and `data-show-if` is an optional gate in the state-store syntax: `ls:key` reads raw localStorage, so `!ls:seen` shows a first-visit banner until `data-state-set="ls:seen:1"` runs. Hover reverts on leave. Both stay off in the editing canvas.

```html
<div id="cookie" popover="manual" data-show-on="load" data-show-dir="show" data-show-if="!ls:seen">
  <button commandfor="cookie" command="hide-popover" data-state-set="ls:seen:1">OK</button>
</div>
```

`data-tab-target` swaps panels: a click hides every `[data-tab-group]` panel named by `data-tab-of` and shows the target. Start every panel but the first with the `hidden` class.

```html
<button data-tab-target="p2" data-tab-of="gallery">Two</button>
<div id="p1" data-tab-group="gallery">One</div>
<div id="p2" class="hidden" data-tab-group="gallery">Two</div>
```

A tab that carries `aria-expanded` keeps it in step: the click sets it to `true` on that tab and `false` on the other tabs of the same `data-tab-of` group.

`data-close-link` on a popover or dialog is a selector: a click on a matching element inside closes it (`a` for a menu drawer that should shut on navigation, `a, button` to include its buttons).

```html
<div id="drawer" popover="manual" data-close-link="a"><a href="/about">About</a></div>
```

`data-print` on a button or link prints the page. A value other than `page` is a selector: the closest ancestor matching it gets the class `ph-print` while the print dialog is open (print only a coupon).

```html
<button data-print="[data-coupon]">Print this coupon</button>
```

`data-scroll-by` names an element by id and scrolls it sideways by its own width on click; `data-scroll-step` is `-1` for back and `1` for forward.

```html
<button data-scroll-by="reel" data-scroll-step="-1">Back</button>
<div id="reel" class="overflow-x-auto">…</div>
```

`data-set-field` is a selector for a form field; a click sets it to `data-set-value` and fires `input` and `change`. Use it on a link that jumps to the form with an option chosen.

```html
<a href="#apply" data-set-field="select[name=position]" data-set-value="sales">Apply for sales</a>
```

`data-key-click` on an element that acts as a button makes Enter and Space click it.

```html
<div role="button" tabindex="0" commandfor="menu" command="toggle-popover" data-key-click>Menu</div>
```

`data-lightbox` on a grid tile shows that tile's photo in the overlay it names (the tile also carries `commandfor` and `command="show-popover"` to open it). The tiles are the grid's children that hold an `<img>`. In the overlay, a button with `data-lightbox-step` (`-1` or `1`) and `data-lightbox-grid` (the grid's id) moves to the previous or next photo, wrapping, and `data-lightbox-caption` names the element that gets the photo's alt text. The overlay's `data-idx` holds the current number. Images from Cloudflare Images open at their 1600px variant.

```html
<div id="grid"><div data-lightbox="viewer" data-lightbox-caption="cap" commandfor="viewer" command="show-popover"><img src="a.jpg" alt="Kitchen"></div></div>
<div id="viewer" popover="manual" data-idx="0">
  <img src="" alt="">
  <p id="cap"></p>
  <button data-lightbox="viewer" data-lightbox-step="-1" data-lightbox-grid="grid" data-lightbox-caption="cap">Previous</button>
</div>
```

A `popover` of `manual` never light-dismisses; Escape closes the most recently opened one, and the open cart drawer (`cart:open`) is in the same stack.

### Built-in behaviours

These run from the core script itself (`src/core/`), with no chunk to load.

`data-autosubmit` on a form submits it when a field changes. A value like `300ms` also submits while typing, after that pause.

```html
<form method="get" action="/shop" data-autosubmit="300ms"><input name="q"><select name="sort"></select></form>
```

`data-copy` on a button copies its value to the clipboard (its own text if the value is empty) and sets `data-copied` for two seconds.

```html
<button data-copy="SAVE10">Copy code</button>
```

`data-dismiss` names a banner. A `data-dismiss-close` button inside hides it and remembers that on this browser.

```html
<aside data-dismiss="promo"><p>Free shipping</p><button data-dismiss-close>Close</button></aside>
```

`data-theme-toggle` on a button flips `data-theme` on `<html>` between `dark` and `light` and remembers the choice.

```html
<button data-theme-toggle>Dark mode</button>
```

`closedby` (as `closedby="any"`) on a dialog closes it on a backdrop click. Browsers with native support do it themselves; the runtime covers the rest.

```html
<dialog id="menu" closedby="any">…</dialog>
```

Prefetch needs no attribute. Browsers without Speculation Rules (Safari, Firefox) get a `<link rel="prefetch">` for a same-origin link once the pointer rests on it for 65 ms or a finger touches it, once per URL. It is off under Save-Data and on 2g, and skips links with a query string, `download`, `target`, `rel="nofollow"`, `data-no-prerender`, and the `/account`, `/cart` and `/api` paths.

### State

A small key-value store shared by the whole page. Keys prefixed `url:` mirror the URL query; `local:` keys persist.

Actions run on click by default. `data-state-on` picks `click`, `hover`, `load` or `interval` (`data-every` sets the time).

`data-state-set` sets a key: `key:value` (the value is the text after the last colon; default `true`; `;` separates several).

```html
<button data-state-set="tab:pricing">Pricing</button>
```

`data-state-toggle` flips a key, or alternates `key:a|b`.

```html
<button data-state-toggle="menu">Menu</button>
```

`data-state-clear` removes a key.

```html
<button data-state-clear="tab">Reset</button>
```

`data-state-step` adds to a number (`key:1`, `key:-1`). Bounds: `data-min`, `data-max`; `data-wrap` wraps around.

```html
<button data-state-step="slide:1" data-min="0" data-max="3" data-wrap>Next</button>
```

`data-state-show` shows the element only when the condition holds (`key`, `!key`, `key=value`, `||` / `&&`). A dotted path walks into a JSON value, so `pdp:variant.image` holds while that field is non-empty.

```html
<div data-state-show="menu">Menu panel</div>
```

`data-state-class` adds classes when a condition holds. Entries are `condition:classes`, split by `;`.

```html
<a data-state-class="tab=pricing:font-bold; !tab:opacity-50">Pricing</a>
```

An entry written `condition=>classes` takes any `data-state-show` expression, so colon-namespaced keys and `&&` / `||` work (the `:` form cannot tell `store:filter` from the separator).

```html
<a data-state-class="store:filter=all=>bg-primary; !store:filter||store:filter=all=>ring-2">All</a>
```

`data-state-text` prints a key's value as the element's text. A key holding JSON can be walked with a dotted path: `pdp:current:matching-variant.formatted` reads `formatted` from that key's value.

```html
<span data-state-text="slide"></span>
```

`data-state-src` sets an image's `src` from `{{state.<key>}}` tokens (dotted paths work as above) and puts the original `src` back while any token is empty.

```html
<img src="/plant.jpg" data-state-src="{{state.pdp:current:matching-variant.image}}">
```

`data-state-bind` two-way binds an input to a key. Options: `data-bind-mode="checked"` for checkboxes, `data-debounce`.

```html
<input data-state-bind="url:q" data-debounce="200ms" type="search">
```

`data-state-in-view` (`key=value`): the most visible member of a key's group writes `key`, `key:index`, `key:number` and `key:count`.

```html
<section data-state-in-view="step=intro">…</section>
```

`data-state-compute="count"` writes how many of the comma-separated `data-from` keys equal `data-count-value` to `data-compute-key` (a quiz score), and follows them.

```html
<div data-state-compute="count" data-compute-key="quiz:score" data-from="quiz:q1,quiz:q2,quiz:q3" data-count-value="Y"></div>
```

`data-state-compute` (value `variant-match`) writes the in-stock variant that matches the chosen options, as JSON, to `data-compute-key`, and clears it while the pick is incomplete or sold out. `data-variants` is the JSON array (each variant's `option1..3` hold the values of the `data-axes` in order, `inventory: 0` is skipped) and `data-axis-key` the key template the option chips write, `%axis%` standing for each axis name.

```html
<div data-state-compute="variant-match" data-compute-key="pdp:variant" data-axes="Size" data-axis-key="pdp:axis:%axis%" data-variants='[{"id":"s1","option1":"M","formatted":"$9.00"}]'></div>
<span data-state-text="pdp:variant.formatted"></span>
```

`data-refetch` marks a listing the server renders from the URL (a storefront grid): its value is the comma-separated URL params it follows, `facet.*` standing for every `url:facet.<key>`. When one of those `url:` state keys changes (a chip's `data-state-set`, a search box's `data-state-bind`, a pager's `data-state-step`), the runtime writes the URL (`history.replaceState`), fetches the page with it, and swaps every `[data-refetch]` element by `id` in place: no reload. `data-state-seed="key=value;…"` on the listing writes the totals its pagination reads, when it appears and after each swap. The host (PageHub) renders the `?category=…` URLs per request, so the same URL loaded fresh shows the same rows.

```html
<button data-state-set="url:category:tees">Tees</button>
<input data-state-bind="url:q" data-debounce="300ms" placeholder="Search">
<div id="grid" data-refetch="q,category,page,facet.*" data-state-seed="shop:pages=3;shop:count=12">…rows…</div>
<span data-state-text="shop:pages"></span>
<button data-state-step="url:page:1" data-min="1">Next</button>
```
