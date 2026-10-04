import { defineConfig } from 'prisma/config';
import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: '.env', quiet: true });

export default defineConfig({
  schema: './prisma/schema.prisma',
  migrations: {
    path: './prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
});
