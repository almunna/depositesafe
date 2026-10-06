// Applies the `stripe` schema owned by the sync package. In live mode the server only
// verifies that schema at startup (see stripe-setup.ts), so it has to exist beforehand.
import { runMigrations } from "stripe-replit-sync";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

await runMigrations({ databaseUrl: process.env.DATABASE_URL });
