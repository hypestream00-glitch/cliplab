import { config } from "dotenv";

if (process.env.NODE_ENV !== "production") {
  config({ path: ".env" });
  config({ path: ".env.local", override: true });
}
