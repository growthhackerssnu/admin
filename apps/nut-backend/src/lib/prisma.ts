import { PrismaClient } from "@/generated/prisma";

const globalForPrisma = globalThis as unknown as { nutPrisma?: PrismaClient };
export const prisma = globalForPrisma.nutPrisma ?? new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] });
if (process.env.NODE_ENV !== "production") globalForPrisma.nutPrisma = prisma;
