import { createRequire } from "node:module";

if (process.env.NODE_ENV !== "production") {
  const require = createRequire(import.meta.url);
  const { config } = require("dotenv") as {
    config: (opts: { path: string; override?: boolean }) => void;
  };
  config({ path: ".env" });
  config({ path: ".env.local", override: true });
}
