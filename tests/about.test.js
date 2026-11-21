/**
 * about.test.js — Help > About agrees with the installer (Phase 10.2).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ABOUT } from '../main/about.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('the About box names the app as the installer does', () => {
  assert.equal(ABOUT.name, pkg.build.productName);
});

test('the About box carries the installer\'s copyright', () => {
  assert.equal(ABOUT.copyright, pkg.build.copyright);
});
