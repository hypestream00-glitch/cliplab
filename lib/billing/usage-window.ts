export function resolveUsagePeriodStart(params: {
  incomingStart: Date | null;
  existingStart: Date | null;
  existingEnd: Date | null;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  if (!params.incomingStart) return params.existingStart;
  if (!params.existingStart) return params.incomingStart;
  const stillInExistingPeriod = Boolean(params.existingEnd && params.existingEnd.getTime() > now.getTime());
  if (stillInExistingPeriod && params.incomingStart.getTime() > params.existingStart.getTime()) {
    return params.existingStart;
  }
  return params.incomingStart;
}
