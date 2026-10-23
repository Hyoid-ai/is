// [TEST] Hyoid verifier demo: regression check for CVE-2021-23337 (lodash < 4.17.21).
// [TEST] Intentionally test-only. Resolves, does not parse ranges: it inspects what npm actually
// [TEST] resolved (package-lock.json, `npm ls lodash --all --json`, and node_modules on disk).
// [TEST] Plain Node, no dependencies. Usage: node .github/scripts/lodash-regression.mjs [dir]
// [TEST] Scope and limits: see README.md in this directory.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {spawnSync} from 'node:child_process';

const MINIMUM = [4, 17, 21];
const REGISTRY_TARBALL = 'https://registry.npmjs.org/lodash/-/lodash-';

// [TEST] Minimal strict semver: MAJOR.MINOR.PATCH[-pre][+build]. Anything else is unsafe.
// [TEST] A prerelease always counts as below the minimum.
export function isSafeVersion(version) {
	const match = /^v?(\d+)\.(\d+)\.(\d+)(-[\da-z.\-]+)?(\+[\da-z.\-]+)?$/iv.exec(String(version ?? ''));
	if (!match) {
		return false;
	}

	if (match[4]) {
		return false;
	}

	const parts = match.slice(1, 4).map(Number);
	for (let index = 0; index < 3; index++) {
		if (parts[index] !== MINIMUM[index]) {
			return parts[index] > MINIMUM[index];
		}
	}

	return true;
}

export function scan(root, {npmLs = true} = {}) {
	const problems = [];
	let checked = 0;

	const check = (where, version, resolved) => {
		checked++;
		if (!isSafeVersion(version)) {
			problems.push(`${where}: lodash ${version ?? '(no version)'}`);
		} else if (resolved !== undefined && !String(resolved).startsWith(REGISTRY_TARBALL)) {
			problems.push(`${where}: lodash from non-registry source ${resolved}`);
		}
	};

	const readJson = file => {
		const full = path.join(root, file);
		if (!fs.existsSync(full)) {
			return undefined;
		}

		try {
			return JSON.parse(fs.readFileSync(full, 'utf8'));
		} catch {
			problems.push(`${file}: not valid JSON`);
			return null;
		}
	};

	// [TEST] 1. Preconditions: a committed package-lock.json is required.
	const pkg = readJson('package.json');
	if (pkg === undefined) {
		problems.push('package.json: missing');
	}

	if (pkg?.workspaces) {
		problems.push('package.json: workspaces are out of scope for this check');
	}

	for (const file of ['pnpm-lock.yaml', 'yarn.lock']) {
		if (fs.existsSync(path.join(root, file))) {
			problems.push(`${file}: unsupported lockfile (only package-lock.json is in scope)`);
		}
	}

	const lock = readJson('package-lock.json');
	if (lock === undefined) {
		problems.push('package-lock.json: missing (a committed lockfile is required)');
	}

	const shrinkwrap = readJson('npm-shrinkwrap.json');

	// [TEST] 2. Lockfile entries (v2/v3 "packages", v1/v2 "dependencies"), nested and aliased.
	for (const [file, data] of [['package-lock.json', lock], ['npm-shrinkwrap.json', shrinkwrap]]) {
		if (!data || typeof data !== 'object') {
			continue;
		}

		for (const [key, entry] of Object.entries(data.packages ?? {})) {
			const isLodash = key.split('node_modules/').at(-1) === 'lodash' || entry?.name === 'lodash';
			if (key !== '' && isLodash) {
				check(`${file} ${key}`, entry?.version, entry?.resolved);
			}
		}

		const walk = (dependencies, trail) => {
			for (const [name, entry] of Object.entries(dependencies ?? {})) {
				const version = String(entry?.version ?? '');
				if (version.startsWith('npm:lodash@')) {
					check(`${file} ${trail}${name}`, version.slice('npm:lodash@'.length), entry.resolved);
				} else if (name === 'lodash') {
					check(`${file} ${trail}${name}`, entry?.version, entry?.resolved);
				}

				walk(entry?.dependencies, `${trail}${name}>`);
			}
		};

		walk(data.dependencies, '');
	}

	// [TEST] 3. npm's own resolution. `npm ls` exits non-zero on tree problems; its JSON is still parsed.
	if (npmLs && fs.existsSync(path.join(root, 'node_modules'))) {
		const result = spawnSync('npm', ['ls', 'lodash', '--all', '--json'], {cwd: root, encoding: 'utf8', shell: process.platform === 'win32'});
		let tree;
		try {
			tree = JSON.parse(result.stdout);
		} catch {
			problems.push(`npm ls: no parseable JSON (exit ${result.status})`);
		}

		const walkTree = (node, trail) => {
			for (const [name, child] of Object.entries(node?.dependencies ?? {})) {
				const isLodash = name === 'lodash' || child?.name === 'lodash' || String(child?.resolved ?? '').startsWith(REGISTRY_TARBALL);
				if (isLodash) {
					check(`npm ls ${trail}${name}`, child?.version, child?.resolved);
				}

				walkTree(child, `${trail}${name}>`);
			}
		};

		walkTree(tree, '');
	}

	// [TEST] 4. Installed copies on disk, any depth, by package name (catches aliases). Symlinks are not followed.
	const walkModules = directory => {
		let names;
		try {
			names = fs.readdirSync(directory, {withFileTypes: true});
		} catch {
			return;
		}

		for (const dirent of names) {
			if (!dirent.isDirectory() || dirent.name.startsWith('.')) {
				continue;
			}

			const full = path.join(directory, dirent.name);
			if (dirent.name.startsWith('@')) {
				walkModules(full);
				continue;
			}

			let manifest;
			try {
				manifest = JSON.parse(fs.readFileSync(path.join(full, 'package.json'), 'utf8'));
			} catch {
				// [TEST] No readable manifest: treated as unnamed.
				manifest = undefined;
			}

			if (manifest?.name === 'lodash' || (dirent.name === 'lodash' && !manifest?.name)) {
				check(path.relative(root, full), manifest?.version);
			}

			walkModules(path.join(full, 'node_modules'));
		}
	};

	walkModules(path.join(root, 'node_modules'));

	return {problems, checked};
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
	const {problems, checked} = scan(path.resolve(process.argv[2] ?? '.'));
	if (problems.length > 0) {
		console.error(`[TEST] lodash-regression FAIL (CVE-2021-23337, need >= ${MINIMUM.join('.')}, no prereleases):`);
		for (const problem of problems) {
			console.error(`  - ${problem}`);
		}

		process.exitCode = 1;
	} else {
		console.log(`[TEST] lodash-regression PASS (${checked} resolved lodash reference(s), all >= ${MINIMUM.join('.')})`);
	}
}
