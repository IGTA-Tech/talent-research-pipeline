import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: "proj_wpftdwfabpbtjosjsnmz",
  dirs: ["./src/trigger"],
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 30000,
      factor: 2,
      randomize: true,
    },
  },
  maxDuration: 900, // 15 minutes default
});
