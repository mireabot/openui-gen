/** Project assets stay at the root; tsc emits src/ into dist/src/. */
export const PROJECT_ROOT = new URL(
  import.meta.url.endsWith(".ts") ? "../" : "../../",
  import.meta.url,
);
