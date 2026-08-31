import { describe, expect, it } from "vitest";
import {
  isSeedDisplayName,
  isSeedWorkspaceName,
  sessionGreetingName,
  studioGreetingTitle,
  toSessionIdentity,
} from "@/lib/auth/identity";

describe("session identity", () => {
  it("does not greet seed Ana as a product fallback", () => {
    expect(isSeedDisplayName("Ana Demo")).toBe(true);
    expect(isSeedDisplayName("Ana")).toBe(true);
    expect(isSeedWorkspaceName("Ana Studio")).toBe(true);
    expect(sessionGreetingName({ name: "Ana Demo", email: "demo@cliplab.app" })).toBeNull();
    expect(studioGreetingTitle({ name: "Ana Demo", email: "demo@cliplab.app" })).toBe("Olá");
    expect(toSessionIdentity({ name: "Ana Demo", email: "demo@cliplab.app" }).name).toBeNull();
  });

  it("uses the authenticated user's real name", () => {
    expect(sessionGreetingName({ name: "Maria Silva", email: "maria@example.com" })).toBe("Maria");
    expect(studioGreetingTitle({ name: "Maria Silva", email: "maria@example.com" })).toBe("Olá, Maria");
    expect(toSessionIdentity({ name: "Maria Silva", email: "maria@example.com" }).email).toBe("maria@example.com");
  });

  it("does not invent a name when the session has only email", () => {
    expect(sessionGreetingName({ name: null, email: "owner@example.com" })).toBeNull();
    expect(studioGreetingTitle({ name: null, email: "owner@example.com" })).toBe("Olá");
    expect(toSessionIdentity({ name: null, email: "owner@example.com" }).email).toBe("owner@example.com");
  });
});
