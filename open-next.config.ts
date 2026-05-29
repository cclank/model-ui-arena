// default open-next.config.ts file created by @opennextjs/cloudflare
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // For best results consider enabling R2 caching.
  // This app does not use ISR, so the dummy cache is enough for the current deployment.
});
