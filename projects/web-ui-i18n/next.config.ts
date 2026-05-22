import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactCompiler: true,
  output: "standalone",
  // pnpm-Workspace lebt zwei Ebenen über projects/web-ui-i18n — Next muss
  // diesen Root kennen, damit `output: standalone` die richtigen
  // node_modules-Symlinks mit in `.next/standalone/` zieht.
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;