import { MongoClient, ServerApiVersion, type Collection } from "mongodb";
import type { Env, MatchState, Prediction, TacticalNote } from "./types";

type HistoryDocument = {
  matchId: string;
  revision: number;
  state: MatchState;
  updatedAt: Date;
};

let cachedUri = "";
let cachedClient: MongoClient | undefined;

async function collection<T extends object>(env: Env, name: string): Promise<Collection<T> | null> {
  if (!env.MONGODB_URI) return null;
  if (!cachedClient || cachedUri !== env.MONGODB_URI) {
    cachedUri = env.MONGODB_URI;
    cachedClient = new MongoClient(cachedUri, {
      serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
      connectTimeoutMS: 3_000,
      serverSelectionTimeoutMS: 3_000,
      maxPoolSize: 2,
    } as never);
  }
  await cachedClient.connect();
  return cachedClient.db(env.MONGODB_DATABASE || "90th_minute").collection<T>(name);
}

export async function persistMatch(env: Env, state: MatchState): Promise<void> {
  const target = await collection<HistoryDocument>(env, "match_history");
  if (!target) return;
  await target.updateOne(
    { matchId: state.id, revision: state.revision },
    { $set: { matchId: state.id, revision: state.revision, state, updatedAt: new Date() } },
    { upsert: true },
  );
}

export async function persistPrediction(env: Env, matchId: string, prediction: Prediction): Promise<void> {
  const target = await collection<Prediction & { matchId: string }>(env, "predictions");
  if (!target) return;
  await target.updateOne({ id: prediction.id }, { $set: { ...prediction, matchId } }, { upsert: true });
}

export async function persistNote(env: Env, matchId: string, note: TacticalNote): Promise<void> {
  const target = await collection<TacticalNote & { matchId: string }>(env, "tactical_notes");
  if (!target) return;
  await target.updateOne({ id: note.id }, { $set: { ...note, matchId } }, { upsert: true });
}

export async function loadHistory(env: Env, matchId: string): Promise<MatchState[]> {
  const target = await collection<HistoryDocument>(env, "match_history");
  if (!target) return [];
  const documents = await target.find({ matchId }).sort({ revision: -1 }).limit(20).toArray();
  return documents.map((document) => document.state);
}
