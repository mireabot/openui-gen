import path from "node:path";
import type { NextConfig } from "next";

/**
 * A static export (out/) that the API server serves from the same origin. The OpenUI library is
 * imported from ../src/lang; these aliases resolve the server's NodeNext `.js` import suffixes.
 */
const nextConfig: NextConfig = {
  output: "export",
  turbopack: {
    // The workspace is the repo: the preview imports ../src/lang.
    root: path.join(__dirname, ".."),
    resolveAlias: {
      "./primitives.js": "../src/lang/primitives.ts",
      "./props.js": "../src/lang/props.ts",
      "../primitives/tokens.js": "../src/primitives/tokens.ts",
    },
  },
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
