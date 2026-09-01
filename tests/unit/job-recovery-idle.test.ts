import { afterEach, describe, expect, it, vi } from "vitest";

const findManyJobs = vi.fn(async () => []);
const findManyRenders = vi.fn(async () => []);
const getQueue = vi.fn();
const enqueue = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    processingJob: { findMany: findManyJobs, update: vi.fn() },
    renderJob: { findMany: findManyRenders },
  },
}));

vi.mock("@/lib/queue", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/queue")>();
  return {
    ...actual,
    getQueue,
    enqueue,
  };
});

vi.mock("@/lib/queue/heartbeat", () => ({
  workerRuntimeStatus: vi.fn(async () => "CONNECTED"),
}));

describe("job recovery idle path", () => {
  afterEach(() => {
    findManyJobs.mockReset();
    findManyRenders.mockReset();
    getQueue.mockReset();
    enqueue.mockReset();
    findManyJobs.mockResolvedValue([]);
    findManyRenders.mockResolvedValue([]);
  });

  it("does not touch BullMQ when nothing is stale", async () => {
    const { recoverPersistedJobs } = await import("@/lib/services/job-recovery");
    const recovered = await recoverPersistedJobs();
    expect(recovered).toBe(0);
    expect(getQueue).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });
});
