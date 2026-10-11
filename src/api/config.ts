const env = import.meta.env;

/** Full invoke URL of the API Gateway endpoint (stage + path included). */
export const API_URL: string = (env.VITE_API_URL ?? '').trim();
export const API_CONTENT_TYPE: string = (env.VITE_API_CONTENT_TYPE ?? 'text/plain;charset=UTF-8').trim();
export const DEMO: boolean = env.VITE_DEMO_MODE === 'true' || API_URL === '';
export const REQUEST_TIMEOUT_MS = 20_000;

const custom = (env.VITE_TILE_URL ?? '').trim();
export const TILES = {
  light: custom || 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: custom || 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
};
