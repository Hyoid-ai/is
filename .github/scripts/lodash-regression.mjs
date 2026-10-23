// [TEST] Hyoid verifier demo: regression check for CVE-2021-23337.
// [TEST] Fails if any lodash below 4.17.21 is declared, locked, or installed.
// [TEST] Plain Node, no dependencies. Usage: node .github/scripts/lodash-regression.mjs [dir]
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const MIN = [4, 17, 21];
const root = path.resolve(process.argv[2] ?? '.');
const problems = [];
let checked = 0;

const parse = v => {
	const m = /(\d+)\.(\d+)\.(\d+)/v.exec(String(v));
	return m ? m.slice(1, 4).map(Number) : undefined;
};

const below = v => {
	for (let i = 0; i < 3; i++) {
		if (v[i] !== MIN[i]) {
			return v[i] < MIN[i];
		}
	}

	return false;
};

const check = (where, version) => {
	checked++;
	const v = parse(version);
	// [TEST] Unparseable spec (e.g. "*", git URL) is treated as unsafe; a range's lowest bound must be >= 4.17.21.
	if (!v || below(v)) {
		problems.push(`${where}: lodash ${version}`);
	}
};

const read = f => {
	const p = path.join(root, f);
	return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : undefined;
};

// [TEST] 1. package.json declared versions.
const pkg = JSON.parse(read('package.json'));
for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
	if (pkg[field]?.lodash) {
		check(`package.json ${field}`, pkg[field].lodash);
	}
}

// [TEST] 2. npm lockfiles.
for (const f of ['package-lock.json', 'npm-shrinkwrap.json']) {
	const text = read(f);
	if (text === undefined) {
		continue;
	}

	const lock = JSON.parse(text);
	for (const [key, entry] of Object.entries(lock.packages ?? {})) {
		if (key === 'node_modules/lodash' || key.endsWith('/node_modules/lodash')) {
			check(`${f} ${key}`, entry.version);
		}
	}

	const walk = (deps, trail) => {
		for (const [name, entry] of Object.entries(deps ?? {})) {
			if (name === 'lodash') {
				check(`${f} ${trail}lodash`, entry.version);
			}

			walk(entry.dependencies, `${trail}${name}>`);
		}
	};

	walk(lock.dependencies, '');
}

// [TEST] 3. pnpm-lock.yaml: keys like "/lodash@4.17.20", "lodash@4.17.20" or "/lodash/4.17.20".
const pnpm = read('pnpm-lock.yaml');
if (pnpm !== undefined) {
	for (const m of pnpm.matchAll(/^\s*['"]?\/?lodash[@\/](\d+\.\d+\.\d+)/gmv)) {
		check('pnpm-lock.yaml', m[1]);
	}
}

// [TEST] 4. yarn.lock: entry headers starting with lodash@, then their version line.
const yarn = read('yarn.lock');
if (yarn !== undefined) {
	for (const m of yarn.matchAll(/^"?lodash@[^\n]*:\n(?:[ \t]+[^\n]*\n)*?[ \t]+version:?\s+"?(\d+\.\d+\.\d+)/gmv)) {
		check('yarn.lock', m[1]);
	}
}

// [TEST] 5. Installed copy, if present.
const installed = read('node_modules/lodash/package.json');
if (installed !== undefined) {
	check('node_modules/lodash', JSON.parse(installed).version);
}

if (problems.length > 0) {
	console.error(`[TEST] lodash-regression FAIL (CVE-2021-23337, need >= ${MIN.join('.')}):`);
	for (const p of problems) {
		console.error(`  - ${p}`);
	}

	process.exitCode = 1;
} else {
	console.log(`[TEST] lodash-regression PASS (${checked} lodash reference(s) checked, all >= ${MIN.join('.')})`);
}
