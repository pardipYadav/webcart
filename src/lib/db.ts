import { MongoClient, type Db } from "mongodb";

let client: MongoClient | null = null;
let database: Db | null = null;
let connecting: Promise<Db | null> | null = null;

function safeMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "connection failed";
  return message.replace(/\/\/[^@\s]+@/g, "//***@");
}

export async function getDb(): Promise<Db | null> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) return null;
  if (database) return database;

  if (!connecting) {
    const pending = (async () => {
      try {
        const nextClient = new MongoClient(uri, { serverSelectionTimeoutMS: 4000 });
        await nextClient.connect();
        client = nextClient;
        database = nextClient.db(process.env.MONGODB_DB?.trim() || "traverso");
        return database;
      } catch (error) {
        console.error("[db]", safeMessage(error));
        client = null;
        database = null;
        return null;
      } finally {
        connecting = null;
      }
    })();
    connecting = pending;
  }

  return connecting;
}

export async function closeDb() {
  await client?.close();
  client = null;
  database = null;
  connecting = null;
}
