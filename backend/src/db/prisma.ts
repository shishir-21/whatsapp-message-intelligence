import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Prisma 7 connects through a driver adapter. Node's module cache makes this
// a single shared client for the whole process.
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});
