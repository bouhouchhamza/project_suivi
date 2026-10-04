import { config as loadDotenv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

loadDotenv({ path: resolve(here, '..', '.env'), override: false, quiet: true });
