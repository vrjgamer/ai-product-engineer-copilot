import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

let checkpointer: PostgresSaver | undefined;

/**
 * Call `.setup()` on the returned saver once before using it — it creates
 * its own checkpoint tables, separate from `migrations/*.sql`.
 * `scripts/migrate.ts` calls it after applying migrations, so running that
 * script provisions everything needed.
 */
export function getCheckpointer(): PostgresSaver {
  if (!checkpointer) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "Missing DATABASE_URL. Set it in your environment (see .env.example).",
      );
    }
    checkpointer = PostgresSaver.fromConnString(connectionString);
  }
  return checkpointer;
}
