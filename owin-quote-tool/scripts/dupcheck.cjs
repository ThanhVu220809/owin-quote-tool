const fs = require('fs');
const ts = fs.readFileSync('src/types/placeholders.ts', 'utf8');
function grab(name) {
  const start = ts.indexOf(name + ' = [');
  const open = ts.indexOf('[', start);
  const close = ts.indexOf(']', open);
  const block = ts.slice(open + 1, close);
  return [...block.matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1]);
}
let ok = true;
for (const n of ['FORMAT1_TOP', 'FORMAT1_ITEM', 'FORMAT2_TOP', 'FORMAT2_ITEM']) {
  const a = grab(n);
  const dup = a.filter((x, i) => a.indexOf(x) !== i);
  if (dup.length) ok = false;
  console.log(n.padEnd(13), a.length + ' keys', dup.length ? 'DUP:' + dup : 'no-dup');
}
console.log(ok ? 'ALL-OK' : 'HAS-DUP');
process.exit(ok ? 0 : 1);
