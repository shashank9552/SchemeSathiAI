import { MongoClient, Db, Collection, Document } from 'mongodb';
import { config } from '../config/index.js';

export interface SchemeChunkDocument extends Document {
  schemeName: string;
  sectionTitle?: string;
  documentTitle: string;
  sourceFile: string;
  pageNumber: number;
  chunkIndex: number;
  text: string;
  category: string;
  level: string;
  language: string;
  isTable?: boolean;
  embedding: number[];
  createdAt: Date;
}

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectToDatabase(): Promise<{ client: MongoClient; db: Db }> {
  if (client && db) {
    return { client, db };
  }

  if (!config.MONGODB_URI) {
    throw new Error('MONGODB_URI is not defined in configuration.');
  }

  client = new MongoClient(config.MONGODB_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
  });

  await client.connect();
  db = client.db(config.MONGODB_DB_NAME);

  console.log(`✅ Connected to MongoDB Atlas: database "${config.MONGODB_DB_NAME}"`);
  return { client, db };
}

export async function getChunksCollection(): Promise<Collection<SchemeChunkDocument>> {
  const { db } = await connectToDatabase();
  return db.collection<SchemeChunkDocument>(config.MONGODB_COLLECTION_NAME);
}

export async function closeDatabaseConnection(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    db = null;
    console.log('MongoDB connection closed.');
  }
}
