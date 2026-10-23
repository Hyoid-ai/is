// [TEST] Hyoid verifier demo: self-test fixtures for lodash-regression.mjs.
// [TEST] Covers QA2's 15 bypasses at db52304 (adapted from QA2's fx.mjs), the earlier 7 cases, and edge cases.
// [TEST] Each fixture is a temp project; the checker runs as a CLI and its exit code is compared.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const checker = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lodash-regression.mjs');
const manifest = extra => JSON.stringify({name: 'x', version: '1.0.0', ...extra});
const lock3 = packages => JSON.stringify({lockfileVersion: 3, packages: {'': {}, ...packages}});
const tarball = version => `https://registry.npmjs.org/lodash/-/lodash-${version}.tgz`;
const top = version => lock3({'node_modules/lodash': {version, resolved: tarball(version)}});
const installed = version => JSON.stringify({name: 'lodash', version});

// [TEST] [id, expected, files]
const cases = [
	// [TEST] QA2 bypasses (15)
	['qa2 overrides', 'FAIL', {'package.json': manifest({overrides: {lodash: '4.17.20'}}), 'package-lock.json': lock3({'node_modules/a/node_modules/lodash': {version: '4.17.20'}})}],
	['qa2 overrides-nested', 'FAIL', {'package.json': manifest({overrides: {foo: {lodash: '4.17.20'}}}), 'package-lock.json': lock3({'node_modules/foo/node_modules/lodash': {version: '4.17.20'}})}],
	['qa2 resolutions', 'FAIL', {'package.json': manifest({resolutions: {lodash: '4.17.20'}}), 'package-lock.json': top('4.17.20')}],
	['qa2 pnpm.overrides', 'FAIL', {'package.json': manifest({pnpm: {overrides: {lodash: '4.17.20'}}}), 'package-lock.json': top('4.17.20')}],
	['qa2 range <4.17.25', 'FAIL', {'package.json': manifest({dependencies: {lodash: '<4.17.25'}}), 'package-lock.json': top('4.17.20')}],
	['qa2 range 4.17.21 || 4.17.20', 'FAIL', {'package.json': manifest({dependencies: {lodash: '4.17.21 || 4.17.20'}}), 'package-lock.json': top('4.17.20')}],
	['qa2 range >=4.17.21 || ^3.0.0', 'FAIL', {'package.json': manifest({dependencies: {lodash: '>=4.17.21 || ^3.0.0'}}), 'package-lock.json': top('3.10.1')}],
	['qa2 alias lo -> npm:lodash@4.17.20', 'FAIL', {'package.json': manifest({dependencies: {lo: 'npm:lodash@4.17.20'}}), 'package-lock.json': lock3({'node_modules/lo': {name: 'lodash', version: '4.17.20', resolved: tarball('4.17.20')}}), 'node_modules/lo/package.json': installed('4.17.20')}],
	['qa2 prerelease 4.17.21-beta', 'FAIL', {'package.json': manifest({dependencies: {lodash: '4.17.21-beta'}}), 'package-lock.json': top('4.17.21-beta')}],
	['qa2 lock v3 alias key', 'FAIL', {'package.json': manifest({}), 'package-lock.json': lock3({'node_modules/lo': {name: 'lodash', version: '4.17.20'}})}],
	['qa2 lock prerelease', 'FAIL', {'package.json': manifest({}), 'package-lock.json': lock3({'node_modules/lodash': {version: '4.17.21-beta.1'}})}],
	['qa2 pnpm alias', 'FAIL', {'package.json': manifest({}), 'package-lock.json': lock3({}), 'pnpm-lock.yaml': 'lockfileVersion: \'9.0\'\npackages:\n  lo@npm:lodash@4.17.20:\n    resolution: {integrity: x}\n'}],
	['qa2 yarn berry alias', 'FAIL', {'package.json': manifest({}), 'package-lock.json': lock3({}), 'yarn.lock': '"lo@npm:lodash@4.17.20":\n  version: 4.17.20\n  resolution: "lodash@npm:4.17.20"\n'}],
	['qa2 node_modules nested', 'FAIL', {
		'package.json': manifest({}), 'package-lock.json': lock3({}), 'node_modules/a/package.json': JSON.stringify({name: 'a', version: '1.0.0'}), 'node_modules/a/node_modules/lodash/package.json': '{"version":"4.17.20"}',
	}],
	['qa2 workspace subpackage', 'FAIL', {'package.json': manifest({workspaces: ['packages/*']}), 'package-lock.json': lock3({}), 'packages/a/package.json': manifest({dependencies: {lodash: '4.17.20'}})}],
	// [TEST] Earlier 7 cases (now lockfile-based)
	['early declared 4.17.20, no lockfile', 'FAIL', {'package.json': manifest({dependencies: {lodash: '4.17.20'}})}],
	['early declared+locked 4.17.21', 'PASS', {'package.json': manifest({dependencies: {lodash: '4.17.21'}}), 'package-lock.json': top('4.17.21')}],
	['early npm lock 4.17.20', 'FAIL', {'package.json': manifest({dependencies: {lodash: '4.17.21'}}), 'package-lock.json': top('4.17.20')}],
	['early yarn.lock 4.17.20', 'FAIL', {'package.json': manifest({}), 'package-lock.json': lock3({}), 'yarn.lock': 'lodash@^4.17.0:\n  version "4.17.20"\n'}],
	['early pnpm-lock 4.17.20', 'FAIL', {'package.json': manifest({}), 'package-lock.json': lock3({}), 'pnpm-lock.yaml': 'packages:\n  /lodash@4.17.20:\n    resolution: {}\n'}],
	['early installed 4.17.20', 'FAIL', {'package.json': manifest({}), 'package-lock.json': top('4.17.21'), 'node_modules/lodash/package.json': installed('4.17.20')}],
	['early seeded main (declared 4.17.20, no lockfile)', 'FAIL', {'package.json': manifest({dependencies: {lodash: '4.17.20'}}), 'node_modules/lodash/package.json': installed('4.17.20')}],
	// [TEST] Edge cases
	['clean no lodash', 'PASS', {'package.json': manifest({}), 'package-lock.json': lock3({})}],
	['clean all 4.17.21', 'PASS', {'package.json': manifest({dependencies: {lodash: '^4.17.21'}}), 'package-lock.json': top('4.17.21'), 'node_modules/lodash/package.json': installed('4.17.21')}],
	['clean 4.17.100 numeric', 'PASS', {'package.json': manifest({}), 'package-lock.json': top('4.17.100')}],
	['clean 4.18.0', 'PASS', {'package.json': manifest({}), 'package-lock.json': top('4.18.0')}],
	['clean 5.0.0', 'PASS', {'package.json': manifest({}), 'package-lock.json': top('5.0.0')}],
	['clean 4.17.21+build', 'PASS', {'package.json': manifest({}), 'package-lock.json': lock3({'node_modules/lodash': {version: '4.17.21+build.1'}})}],
	['out of scope lodash.template only', 'PASS', {'package.json': manifest({dependencies: {'lodash.template': '4.5.0'}}), 'package-lock.json': lock3({'node_modules/lodash.template': {version: '4.5.0'}})}],
	['4.17.9 below', 'FAIL', {'package.json': manifest({}), 'package-lock.json': top('4.17.9')}],
	['3.10.1 below', 'FAIL', {'package.json': manifest({}), 'package-lock.json': top('3.10.1')}],
	['lock v1 deps', 'FAIL', {'package.json': manifest({}), 'package-lock.json': JSON.stringify({lockfileVersion: 1, dependencies: {lodash: {version: '4.17.20'}}})}],
	['lock v2 nested deps', 'FAIL', {'package.json': manifest({}), 'package-lock.json': JSON.stringify({lockfileVersion: 2, dependencies: {a: {version: '1.0.0', dependencies: {lodash: {version: '4.17.20'}}}}})}],
	['lock v1 alias version', 'FAIL', {'package.json': manifest({}), 'package-lock.json': JSON.stringify({lockfileVersion: 1, dependencies: {lo: {version: 'npm:lodash@4.17.20'}}})}],
	['lock entry no version', 'FAIL', {'package.json': manifest({}), 'package-lock.json': lock3({'node_modules/lodash': {}})}],
	['lock git source tagged 4.17.21', 'FAIL', {'package.json': manifest({}), 'package-lock.json': lock3({'node_modules/lodash': {version: '4.17.21', resolved: 'git+https://example.invalid/evil.git#v4.17.21'}})}],
	['lock not a version (x)', 'FAIL', {'package.json': manifest({}), 'package-lock.json': top('4.x')}],
	['shrinkwrap 4.17.20', 'FAIL', {'package.json': manifest({}), 'package-lock.json': lock3({}), 'npm-shrinkwrap.json': top('4.17.20')}],
	['lockfile corrupt', 'FAIL', {'package.json': manifest({}), 'package-lock.json': '{not json'}],
	['package.json missing', 'FAIL', {'package-lock.json': lock3({})}],
	['installed prerelease', 'FAIL', {'package.json': manifest({}), 'package-lock.json': lock3({}), 'node_modules/lodash/package.json': installed('4.17.21-rc.1')}],
	['installed scoped nested', 'FAIL', {
		'package.json': manifest({}), 'package-lock.json': lock3({}), 'node_modules/@s/a/package.json': JSON.stringify({name: '@s/a', version: '1.0.0'}), 'node_modules/@s/a/node_modules/lodash/package.json': installed('4.17.20'),
	}],
];

const base = fs.mkdtempSync(path.join(os.tmpdir(), 'lodash-regression-selftest-'));
let failures = 0;
try {
	for (const [index, [id, expected, files]] of cases.entries()) {
		const directory = path.join(base, String(index));
		for (const [file, content] of Object.entries(files)) {
			fs.mkdirSync(path.dirname(path.join(directory, file)), {recursive: true});
			fs.writeFileSync(path.join(directory, file), content);
		}

		fs.mkdirSync(directory, {recursive: true});
		const result = spawnSync(process.execPath, [checker, directory], {encoding: 'utf8'});
		const got = result.status === 0 ? 'PASS' : (result.status === 1 ? 'FAIL' : `ERROR(${result.status})`);
		const ok = got === expected;
		if (!ok) {
			failures++;
		}

		console.log(`${ok ? 'ok  ' : 'BAD '} expect=${expected} got=${got}  ${id}`);
	}
} finally {
	fs.rmSync(base, {recursive: true, force: true});
}

console.log(`[TEST] lodash-regression self-test: ${cases.length - failures}/${cases.length} as expected`);
if (failures > 0) {
	process.exitCode = 1;
}
