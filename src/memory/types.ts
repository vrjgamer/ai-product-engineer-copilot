export interface MemoryScope {
  userId: string;
  projectId: string;
}

export interface MemoryRecord extends MemoryScope {
  id: string;
  content: string;
  writtenAt: string;
  invalidatedAt?: string;
  invalidatedReason?: string;
}

export interface WriteMemoryInput extends MemoryScope {
  content: string;
}

export interface MemoryStore {
  write(input: WriteMemoryInput): Promise<MemoryRecord>;
  /** Active (non-invalidated) records for a scope, unless includeInvalidated is set. */
  retrieve(scope: MemoryScope, options?: { includeInvalidated?: boolean }): Promise<MemoryRecord[]>;
  invalidate(id: string, reason: string): Promise<void>;
}
