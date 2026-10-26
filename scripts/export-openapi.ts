import { writeFileSync } from 'node:fs';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db/database.js';

const db = openDatabase(':memory:');
const app = await buildApp({ db });
await app.ready();

const outputPath = 'docs/openapi.json';
writeFileSync(outputPath, `${JSON.stringify(app.swagger(), null, 2)}\n`);
console.log(`OpenAPI spec written to ${outputPath}`);

await app.close();
db.close();
