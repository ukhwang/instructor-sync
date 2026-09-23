import { defineConfig } from 'drizzle-kit';

// No dotenv: never load the existing app or Supabase configuration here.
export default defineConfig({
  schema: './schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  strict: true,
});
