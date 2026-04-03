declare global {
  namespace App {
    // eslint-disable-next-line no-redeclare -- SvelteKit type augmentation
    interface Error {
      message: string;
      kind?: string;
      traceId?: string;
      timestamp?: number;
    }
  }
}

// eslint-disable-next-line unicorn/require-module-specifiers -- SvelteKit module augmentation
export {};
