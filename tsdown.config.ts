import { defineConfig } from 'tsdown';

export default defineConfig({
  external: ['bun:sqlite'],
});