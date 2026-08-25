import { attendreBase, pool } from '../db/pool.ts';
import { migrer } from '../db/migrations.ts';

await attendreBase();
const appliquees = await migrer();
console.log(appliquees.length ? `${appliquees.length} migration(s) appliquée(s).` : 'Rien à appliquer.');
await pool.end();
