import {readFileSync} from 'node:fs';

const code = readFileSync(new URL('../serve.ts', import.meta.url), {encoding: 'utf8'});

const { index } = code.match(/function createGateway\(/)!;
const names: string[] = [];
for (const match of code.slice(index).matchAll(/case '([^\']+?)'/g)) {
	names.push(match[1]);
}

console.log(names);

console.log(names.map(x => `\`${x}\``).sort().join(' '));
