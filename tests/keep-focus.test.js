/**
 * keep-focus.test.js — which control gets the keyboard's focus back after
 * a part of the screen is redrawn (BUILD_UI.md UI.10.3).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickRefocus } from '../src/ui/keep-focus.js';

const c = (key, disabled = false) => ({ key, disabled });

test('focus goes back to the same control, wherever it now is', () => {
  assert.equal(pickRefocus([c('a'), c('b'), c('heat-2')], 'heat-2', 0), 2);
});

test('a control whose words changed keeps its place', () => {
  // "Air hole open" became "Air hole closed": no match, same place.
  assert.equal(pickRefocus([c('Gas off'), c('Heat 1'), c('Air hole closed')], 'Air hole open', 2), 2);
});

test('a control that became disabled passes focus to the next one', () => {
  assert.equal(pickRefocus([c('a'), c('dip', true), c('current')], 'dip', 1), 2);
});

test('at the end, focus moves back to the nearest control before', () => {
  assert.equal(pickRefocus([c('a'), c('b', true)], 'gone', 5), 0);
});

test('nothing to focus gives -1', () => {
  assert.equal(pickRefocus([], 'a', 0), -1);
  assert.equal(pickRefocus([c('a', true)], 'b', 0), -1);
});
