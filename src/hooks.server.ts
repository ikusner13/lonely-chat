import * as Effect from "effect/Effect";

import { initializeDatabase } from "./db/database";
import { runtime } from "$lib/server/runtime";

export const init = async () => {
  await Effect.runPromise(initializeDatabase());
};

process.on("sveltekit:shutdown", () => {
  void runtime.dispose();
});
