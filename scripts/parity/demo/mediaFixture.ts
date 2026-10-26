/**
 * `?fixture=media`: a page exercising the media elements whose engine defs were ported in
 * `engine-elements` — a `{% map %}` with a pin and a route child, a `<video>`, an `<iframe>`
 * embed, an icon-filter output (`{{ … | icon }}`) and an inline `<svg>`. Drives the per-element
 * inspector controls (Map / MapPoint / MapPath / Video / Embed / Icon) to parity.
 */
export const MEDIA_PATH = "index.liquid";

export const MEDIA_PAGE = `<main class="flex w-full flex-col gap-8 p-6" data-edit-name="Media" data-edit-home data-edit-slug="">
<section class="flex flex-col gap-3" id="find-us">
  <h2 class="text-xl font-semibold">Find us</h2>
  {% map lat: 34.0488, lng: -118.2518, zoom: 14, tiles: "osm", grayscale: true %}
    <div data-lat="34.0488" data-lng="-118.2518" data-edit-name="Shop pin"><strong>Our shop</strong> 123 Spring St, Los Angeles</div>
    <div data-path="34.0488,-118.2518&#10;34.0520,-118.2470" data-color="#e11d48" data-weight="5" data-opacity="0.9" data-dashed="" aria-label="Walk from the lot" data-edit-name="Walk route">Walk from the lot</div>
  {% endmap %}
</section>
<section class="flex flex-col gap-3" id="watch">
  <h2 class="text-xl font-semibold">Watch</h2>
  <video src="https://example.com/tour.mp4" poster="" controls width="640" height="360" class="w-full rounded-box" data-edit-name="Tour video"></video>
</section>
<section class="flex flex-col gap-3" id="embed">
  <h2 class="text-xl font-semibold">Embed</h2>
  <iframe src="https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ" title="Promo" loading="lazy" class="aspect-video w-full rounded-box" data-edit-name="YouTube embed"></iframe>
</section>
<section class="flex flex-row items-center gap-3" id="icon">
  <h2 class="text-xl font-semibold">Icon</h2>
  <span class="text-primary size-6 [&>svg]:size-full" data-edit-name="Phone icon">{{ 'tb/TbPhone' | icon }}</span>
  <svg viewBox="0 0 24 24" class="size-6" data-edit-name="Inline SVG"><circle cx="12" cy="12" r="10" fill="currentColor"/></svg>
</section>
</main>
`;

export const MEDIA_FILES: Record<string, string> = {
  [MEDIA_PATH]: MEDIA_PAGE,
};
