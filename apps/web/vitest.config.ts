import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineProject } from "vitest/config";

export default defineProject({
  root: path.join(import.meta.dirname, "../.."),
  plugins: [react()],
  test: {
    name: "web",
    environment: "jsdom",
    include: ["apps/web/**/*.test.{ts,tsx}"]
  }
});
