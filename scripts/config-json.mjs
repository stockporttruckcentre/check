// Prints the default checklist config as JSON, for seeding version 1 in the database.
import { DEFAULT_CONFIG } from '../src/data/defaults.ts';
process.stdout.write(JSON.stringify(DEFAULT_CONFIG));
