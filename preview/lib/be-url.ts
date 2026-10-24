/**
 * The API origin. Empty in the bundled build: the server serves this preview, so calls are
 * same-origin. `npm run preview` (next dev on its own port) talks to the dev server on 8080.
 */
export const BE_URL = process.env.NEXT_PUBLIC_BE_URL ?? (process.env.NODE_ENV === "development" ? "http://localhost:8080" : "");
