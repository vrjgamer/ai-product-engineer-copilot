import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  MemoryRecord,
  MemoryScope,
  MemoryStore,
  WriteMemoryInput,
} from "./types.js";

/**
 * Each session/process is a separate FileMemoryStore instance pointed at the
 * same file path — persistence across sessions is proven by two instances
 * sharing that path, not by any in-process cache.
 */
export class FileMemoryStore implements MemoryStore {
  constructor(private readonly filePath: string) {}

  async write(input: WriteMemoryInput): Promise<MemoryRecord> {
    const records = await this.readAll();
    const record: MemoryRecord = {
      id: randomUUID(),
      userId: input.userId,
      projectId: input.projectId,
      content: input.content,
      writtenAt: new Date().toISOString(),
    };
    records.push(record);
    await this.writeAll(records);
    return record;
  }

  async retrieve(
    scope: MemoryScope,
    options?: { includeInvalidated?: boolean }
  ): Promise<MemoryRecord[]> {
    const records = await this.readAll();
    return records.filter(
      (record) =>
        record.userId === scope.userId &&
        record.projectId === scope.projectId &&
        (options?.includeInvalidated || !record.invalidatedAt)
    );
  }

  async invalidate(id: string, reason: string): Promise<void> {
    const records = await this.readAll();
    const record = records.find((r) => r.id === id);
    if (!record) {
      throw new Error(`No memory record with id "${id}"`);
    }
    record.invalidatedAt = new Date().toISOString();
    record.invalidatedReason = reason;
    await this.writeAll(records);
  }

  private async readAll(): Promise<MemoryRecord[]> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      return JSON.parse(raw) as MemoryRecord[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  private async writeAll(records: MemoryRecord[]): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(records, null, 2), "utf-8");
  }
}
