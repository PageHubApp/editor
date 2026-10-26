/**
 * The demo / parity fixture: a Moss & Fern storefront page that `{% render %}`s a reusable
 * header and footer partial, so the components board has real cards to show. Memory storage
 * serves `FIXTURE_FILES`; `FIXTURE` / `FIXTURE_PATH` stay the home page the parity steps drive.
 *
 * The page is a real document: a `<head>` carrying this page's SEO (title / meta / canonical),
 * then the chrome partials around a `<main>` page node. Selecting the `<main>` opens the Page
 * settings surface (home / 404 / URL + SEO head markup).
 */
export const FIXTURE_PATH = "index.liquid";

const HEADER = `<header class="flex items-center justify-between p-4 md:p-6 bg-base-200" data-edit-name="Header">
  <a href="/" class="text-lg font-bold">Moss & Fern</a>
  <nav class="flex gap-4"><a href="/shop">Shop</a><a href="/about">About</a></nav>
</header>
`;

const FOOTER = `<footer class="p-4 text-sm bg-base-200" data-edit-name="Footer">&copy; Moss &amp; Fern</footer>
`;

export const FIXTURE = `<head>
  <title>Moss &amp; Fern — Houseplants, potted by hand</title>
  <meta name="description" content="Small-batch houseplants, potted by hand and shipped with care.">
  <link rel="canonical" href="https://mossandfern.example/">
  <style>body{margin:0;font-family:system-ui,sans-serif}img{max-width:100%}</style>
</head>
{% render 'header' %}
<main class="flex w-full flex-col" data-edit-name="Home" data-edit-home data-edit-slug="">
<section class="flex flex-col gap-4 p-4 md:p-8 lg:p-10" id="hero">
  <h1 class="text-3xl font-bold">Plants for slow rooms</h1>
  <p class="text-base">Small-batch houseplants, potted by hand and shipped with care.</p>
  <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='240'%3E%3Crect width='640' height='240' fill='%23a7c4a0'/%3E%3C/svg%3E" alt="Ferns on a shelf" class="rounded-box w-full">
  <div class="flex gap-2">
    <button type="button" class="btn btn-primary px-6 py-2">Shop plants</button>
    <a href="/about" class="underline">Our story</a>
  </div>
</section>
<section class="flex flex-col gap-3 p-4 md:p-8" id="contact">
  <h2 class="text-xl font-semibold">Stay in touch</h2>
  <form action="/subscribe" method="post" class="flex flex-col gap-2 max-w-md">
    <label for="email" class="text-sm">Email</label>
    <input id="email" name="email" type="email" placeholder="you@example.com" class="border p-2 rounded-field">
    <button type="submit" class="btn px-6 py-2">Subscribe</button>
  </form>
</section>
</main>
{% render 'footer' %}
`;

/** Every file the demo seeds into memory storage: the home page plus the reusable partials. */
export const FIXTURE_FILES: Record<string, string> = {
  [FIXTURE_PATH]: FIXTURE,
  "partials/header.liquid": HEADER,
  "partials/footer.liquid": FOOTER,
};
