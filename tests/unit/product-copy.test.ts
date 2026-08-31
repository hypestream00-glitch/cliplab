import { describe, expect, it } from "vitest";
import { statusLabel } from "@/lib/ui/status-labels";
import { friendlyError } from "@/lib/ui/friendly-error";

describe("product copy", () => {
  it("humanizes pipeline statuses", () => {
    expect(statusLabel("READY")).toBe("Pronto");
    expect(statusLabel("QUEUED")).toBe("Na fila");
    expect(statusLabel("FAILED")).toBe("Falhou");
  });

  it("hides technical error details", () => {
    expect(friendlyError("FFmpeg/ffprobe não está instalado")).toMatch(/vídeo/i);
    expect(friendlyError("PrismaClientKnownRequestError")).toMatch(/Não foi possível concluir/);
  });
});
