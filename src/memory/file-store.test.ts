import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileMemoryStore } from "./file-store.js";

describe("FileMemoryStore", () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "memory-store-test-"));
    filePath = join(dir, "memory.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("makes a fact written in one session retrievable in a later session", async () => {
    const sessionOne = new FileMemoryStore(filePath);
    await sessionOne.write({
      userId: "user-1",
      projectId: "project-1",
      content: "Target market is early-stage B2B SaaS founders.",
    });

    // A brand-new store instance, as if a new process/session started.
    const sessionTwo = new FileMemoryStore(filePath);
    const records = await sessionTwo.retrieve({ userId: "user-1", projectId: "project-1" });

    expect(records).toHaveLength(1);
    expect(records[0].content).toBe("Target market is early-stage B2B SaaS founders.");
  });

  it("scopes retrieval per user/project with no cross-leak", async () => {
    const store = new FileMemoryStore(filePath);
    await store.write({
      userId: "user-1",
      projectId: "project-a",
      content: "Project A fact",
    });
    await store.write({
      userId: "user-2",
      projectId: "project-b",
      content: "Project B fact",
    });

    const userOneRecords = await store.retrieve({ userId: "user-1", projectId: "project-a" });
    const userTwoRecords = await store.retrieve({ userId: "user-2", projectId: "project-b" });

    expect(userOneRecords.map((r) => r.content)).toEqual(["Project A fact"]);
    expect(userTwoRecords.map((r) => r.content)).toEqual(["Project B fact"]);

    // Same userId, different project must not see each other's facts either.
    const wrongProject = await store.retrieve({ userId: "user-1", projectId: "project-b" });
    expect(wrongProject).toHaveLength(0);
  });

  it("excludes invalidated memory from default retrieval but keeps it queryable for audit", async () => {
    const store = new FileMemoryStore(filePath);
    const record = await store.write({
      userId: "user-1",
      projectId: "project-1",
      content: "Old pricing model was usage-based.",
    });

    await store.invalidate(record.id, "Superseded by new flat-rate pricing decision");

    const active = await store.retrieve({ userId: "user-1", projectId: "project-1" });
    expect(active).toHaveLength(0);

    const all = await store.retrieve(
      { userId: "user-1", projectId: "project-1" },
      { includeInvalidated: true }
    );
    expect(all).toHaveLength(1);
    expect(all[0].invalidatedReason).toBe("Superseded by new flat-rate pricing decision");
  });
});
