export function canCancelPublication(status: string) {
  return ["DRAFT", "SCHEDULED", "QUEUED"].includes(status);
}
