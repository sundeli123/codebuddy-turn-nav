// list_targets.mjs — Print every CDP target (type / title / url).
import { listTargets } from './cdp.mjs';

const PORT = Number(process.argv[2] || 9333);
const list = await listTargets(PORT);
console.log(`port ${PORT}: ${list.length} targets`);
for (const t of list) {
  console.log(`${(t.type || '?').padEnd(8)} | ${(t.title || '').slice(0, 34).padEnd(34)} | ${(t.url || '').slice(0, 78)}`);
}
