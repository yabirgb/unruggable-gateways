import {readFileSync} from 'node:fs';

const code = readFileSync(new URL('../../scripts/serve.ts', import.meta.url), {encoding: 'utf8'});

const start = code.match(/function createGateway\(/)!.index!;
const end = start + code.slice(start).match(/^}$/m)!.index!;

const names: string[] = [];
for (const match of code.slice(start, end).matchAll(/case '([^\']+?)'/g)) {
	names.push(match[1]);
}

console.log(names.length);
console.log(names);
console.log(names.map(x => `\`${x}\``).sort().join(' '));
