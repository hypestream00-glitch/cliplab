export const OUTPUT_ASPECTS = ["9:16", "1:1", "16:9"] as const;
export type OutputAspect = (typeof OUTPUT_ASPECTS)[number];

export function parseOutputAspect(value: unknown): OutputAspect {
  return OUTPUT_ASPECTS.includes(value as OutputAspect) ? (value as OutputAspect) : "9:16";
}
