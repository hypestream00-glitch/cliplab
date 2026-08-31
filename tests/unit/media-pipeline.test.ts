import { describe, expect, it } from "vitest";
import { validateClipWindow, validateUploadFile, InvalidVideoError } from "@/lib/media/validate";
import { parseFfprobeOutput, ProbeFailedError } from "@/lib/ffmpeg";
import { parseCanvas } from "@/lib/editor/state";

describe("upload validation", () => {
  it("accepts mp4 mov webm", () => {
    expect(validateUploadFile({ filename: "a.mp4", mimeType: "video/mp4", sizeBytes: 1000, maxBytes: 10_000 }).ext).toBe(".mp4");
    expect(validateUploadFile({ filename: "a.mov", mimeType: "video/quicktime", sizeBytes: 1000, maxBytes: 10_000 }).ext).toBe(".mov");
    expect(validateUploadFile({ filename: "a.webm", mimeType: "video/webm", sizeBytes: 1000, maxBytes: 10_000 }).ext).toBe(".webm");
  });
  it("rejects bad extension and oversized files", () => {
    expect(() => validateUploadFile({ filename: "a.avi", mimeType: "video/x-msvideo", sizeBytes: 10, maxBytes: 100 })).toThrow(InvalidVideoError);
    expect(() => validateUploadFile({ filename: "a.mp4", mimeType: "video/mp4", sizeBytes: 200, maxBytes: 100 })).toThrow(InvalidVideoError);
  });
});

describe("clip windows", () => {
  it("rejects invalid ranges", () => {
    expect(() => validateClipWindow(-1, 10, 100)).toThrow(InvalidVideoError);
    expect(() => validateClipWindow(0, 200, 100)).toThrow(InvalidVideoError);
    expect(() => validateClipWindow(10, 10, 100)).toThrow(InvalidVideoError);
  });
  it("accepts a valid window", () => {
    expect(validateClipWindow(1000, 4000, 10_000)).toEqual({ startMs: 1000, endMs: 4000, durationMs: 3000 });
  });
});

describe("ffprobe parse", () => {
  it("never invents duration", () => {
    expect(() => parseFfprobeOutput("{}")).toThrow(ProbeFailedError);
    expect(() => parseFfprobeOutput('{"streams":[{"codec_type":"video","width":1920,"height":1080}]}')).toThrow(ProbeFailedError);
  });
  it("reads real probe json", () => {
    const result = parseFfprobeOutput(
      JSON.stringify({
        format: { duration: "12.5", bit_rate: "800000" },
        streams: [
          { codec_type: "video", codec_name: "h264", width: 1280, height: 720, avg_frame_rate: "30/1" },
          { codec_type: "audio", codec_name: "aac" },
        ],
      }),
    );
    expect(result.durationMs).toBe(12500);
    expect(result.width).toBe(1280);
    expect(result.height).toBe(720);
    expect(result.fps).toBe(30);
    expect(result.codec).toBe("h264");
    expect(result.audioCodec).toBe("aac");
  });
});

describe("editor canvas", () => {
  it("clamps trim to duration", () => {
    const parsed = parseCanvas({ trimStartMs: -10, trimEndMs: 99999 }, 5000);
    expect(parsed.trimStartMs).toBe(0);
    expect(parsed.trimEndMs).toBe(5000);
  });
});
