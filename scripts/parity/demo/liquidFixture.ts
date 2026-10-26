/**
 * `?fixture=liquid`: a page with every Liquid block the inspector has a panel for (`for`, `if`,
 * `unless`, `case`, `paginate`, `form`, `render`, `section`), the section's `{% schema %}`
 * and the files they read.
 */
const HERO = `<section class="p-6 bg-base-200" data-edit-name="Hero">
  <h2 class="text-2xl font-bold">{{ section.settings.headline }}</h2>
  <p>{{ section.settings.subhead }}</p>
</section>
{% schema %}
{
  "name": "Hero",
  "settings": [
    { "type": "header", "content": "Copy" },
    { "type": "text", "id": "headline", "label": "Headline", "default": "Plants for slow rooms" },
    { "type": "textarea", "id": "subhead", "label": "Subhead", "default": "Small-batch houseplants." },
    { "type": "checkbox", "id": "show_badge", "label": "Show badge", "default": true },
    { "type": "select", "id": "align", "label": "Alignment", "default": "left", "options": [{ "value": "left", "label": "Left" }, { "value": "center", "label": "Center" }] },
    { "type": "range", "id": "columns", "label": "Columns", "min": 1, "max": 4, "step": 1, "default": 2 },
    { "type": "paragraph", "content": "These apply to this hero only." }
  ]
}
{% endschema %}
`;

const CARD = `<article class="p-2 border rounded-box" data-edit-name="Card"><h3>{{ product.title }}</h3></article>
`;

export const LIQUID_PATH = "index.liquid";

export const LIQUID_PAGE = `<main class="flex flex-col gap-4 p-4">
  {% section 'hero', headline: "Plants for slow rooms" %}
  <ul class="flex gap-2">
    {% for p in products %}
      <li>{{ p.title }}</li>
    {% endfor %}
  </ul>
  {% if customer %}
    <p>Hi {{ customer.first_name }}</p>
  {% else %}
    <p>Sign in</p>
  {% endif %}
  {% unless cart.empty %}
    <p>Your cart</p>
  {% endunless %}
  {% case shop.locale %}
    {% when 'en' %}
      <p>English</p>
    {% when 'fr' %}
      <p>Français</p>
    {% else %}
      <p>Other</p>
  {% endcase %}
  {% paginate collection.products by 8 %}
    <p>Page {{ paginate.current_page }}</p>
  {% endpaginate %}
  {% form 'customer' %}
    <input name="email" type="email" class="border p-2">
    <button type="submit" class="btn">Join</button>
  {% endform %}
  {% render 'card', product: featured %}
</main>
`;

export const LIQUID_FILES: Record<string, string> = {
  [LIQUID_PATH]: LIQUID_PAGE,
  "sections/hero.liquid": HERO,
  "partials/card.liquid": CARD,
};
