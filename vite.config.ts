import { defineConfig } from "vite-plus";

export default defineConfig({
  lint: {
    categories: {
      correctness: "error",
      pedantic: "warn",
      perf: "error",
      restriction: "warn",
      style: "warn",
      suspicious: "error",
    },
    ignorePatterns: [".references"],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  pack: {
    deps: {
      neverBundle: ["bun:sqlite"],
    },
  },
  staged: {
    "*": "vp check --fix",
  },
  test: {
    exclude: [".references/**", "node_modules/**"],
  },
});
