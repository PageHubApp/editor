/**
 * The pinned Leaflet build the map chunk loads when the page's config names none. Exported so a page that sends a
 * script policy (the app's `/blocks/render`) can allow exactly this file.
 */
export const LEAFLET = { js: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js", css: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" } as const;
