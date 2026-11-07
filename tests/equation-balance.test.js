/**
 * equation-balance.test.js — proves the equation checker that the content
 * validator relies on (BUILD_PHASE_2.md stage 2.1.2) counts correctly.
 *
 * The important half is the failures: an unbalanced equation must never be
 * passed, and an equation written in words must come back "unreadable",
 * never "balanced". A checker that quietly passes what it cannot read is
 * worse than none, because it makes unchecked content look checked.
 *
 * Run them with:  npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { checkEquation } from '../scripts/lib/equation-balance.mjs';

const status = (equation) => checkEquation(equation).status;

test('simple molecular equations', () => {
  assert.equal(status('HCl + NaOH → NaCl + H₂O'), 'balanced');
  assert.equal(status('2H₂ + O₂ → 2H₂O'), 'balanced');
  assert.equal(status('H₂ + O₂ → H₂O'), 'unbalanced');
});

test('brackets, hydrates and fractional coefficients', () => {
  assert.equal(status('Ca(OH)₂ + CO₂ → CaCO₃↓ + H₂O'), 'balanced');
  assert.equal(status('CuSO₄·5H₂O →(heat) CuSO₄ + 5H₂O'), 'balanced');
  assert.equal(status('CuSO₄·5H₂O →(heat) CuSO₄ + 4H₂O'), 'unbalanced');
  assert.equal(status('Mg + ½O₂ → MgO'), 'balanced');
});

test('charges must balance as well as atoms', () => {
  assert.equal(status('Ba²⁺ + SO₄²⁻ → BaSO₄↓'), 'balanced');
  assert.equal(status('MnO₄⁻ + 5Fe²⁺ + 8H⁺ → Mn²⁺ + 5Fe³⁺ + 4H₂O'), 'balanced');
  // Right atoms, wrong charge: one electron too few on the left.
  const result = checkEquation('Fe³⁺ + Cu → Fe²⁺ + Cu²⁺');
  assert.equal(result.status, 'unbalanced');
  assert.match(result.detail, /charge/);
});

test('complex ions, ligand shorthand and EDTA', () => {
  assert.equal(status('[Cu(H₂O)₆]²⁺ + 4Cl⁻ ⇌ [CuCl₄]²⁻ + 6H₂O'), 'balanced');
  assert.equal(status('[Ni(NH₃)₆]²⁺ + 3en → [Ni(en)₃]²⁺ + 6NH₃'), 'balanced');
  assert.equal(status('Ca²⁺ + EDTA⁴⁻ → [Ca(EDTA)]²⁻'), 'balanced');
  assert.equal(status('[PtCl₄]²⁻ + 2NH₃ → cis-[Pt(NH₃)₂Cl₂] + 2Cl⁻'), 'balanced');
});

test('state symbols, labels and notes on the arrow are ignored', () => {
  assert.equal(status('NaOH(alcoholic) + C₂H₅Br → C₂H₄ + NaBr + H₂O'), 'balanced');
  assert.equal(status('PbCl₂(s) →(hot water) Pb²⁺ + 2Cl⁻'), 'balanced');
  assert.equal(status('S₂O₈²⁻ + 2I⁻ →(Fe²⁺/Fe³⁺) 2SO₄²⁻ + I₂'), 'balanced');
  assert.equal(status('C (dissolved in the iron) + O₂ → CO₂'), 'balanced');
  assert.equal(status('2Zn + O₂ → 2ZnO   (the iron is untouched)'), 'balanced');
});

test('electrolysis: electrons, chained arrows and "then"', () => {
  assert.equal(status('Cu(anode) → Cu²⁺ + 2e⁻   then   Cu²⁺ + 2e⁻ → Cu(cathode)'), 'balanced');
  assert.equal(status('Cu(impure) → Cu²⁺ + 2e⁻ → Cu(pure)'), 'balanced');
  assert.equal(status('Cu(anode) → Cu²⁺ + e⁻'), 'unbalanced');
});

test('every step of a multi-step equation is checked, not just the first', () => {
  assert.equal(status('A₂ → A₂, then Fe²⁺ + NO → [Fe(H₂O)₅(NO)]²⁺'), 'unreadable');
  assert.equal(
    status('NO₃⁻ + 3Fe²⁺ + 4H⁺ → NO + 3Fe³⁺ + 2H₂O,  then  Fe²⁺ + NO → [Fe(H₂O)₅(NO)]²⁺'),
    'unbalanced'
  );
  assert.equal(
    status('NO₃⁻ + 3Fe²⁺ + 4H⁺ → NO + 3Fe³⁺ + 2H₂O,  then  [Fe(H₂O)₆]²⁺ + NO → [Fe(H₂O)₅(NO)]²⁺ + H₂O'),
    'balanced'
  );
});

test('structural formulas and polymers, for any n', () => {
  assert.equal(status('C₆H₅N₂⁺ + C₆H₅OH → C₆H₅N=NC₆H₄OH + H⁺'), 'balanced');
  assert.equal(status('n CH₂=CH₂ → -(CH₂CH₂)ₙ-'), 'balanced');
  assert.equal(status('n H₂NCH₂COOH → -(NHCH₂CO)ₙ- + n H₂O'), 'balanced');
  // Balanced only when n = 1, so it must fail.
  assert.equal(status('n H₂NCH₂COOH → -(NHCH₂CO)ₙ- + H₂O'), 'unbalanced');
});

test('both readings of a number in front of an oxide formula are tried', () => {
  // Two of the whole rust formula...
  assert.equal(status('4Fe + 3O₂ + 2xH₂O → 2Fe₂O₃·xH₂O'), 'balanced');
  // ...but one formula unit of mullite written as oxides.
  assert.equal(status('3Al₂Si₂O₇ →(1100 °C+) 3Al₂O₃·2SiO₂ + 4SiO₂'), 'balanced');
  assert.equal(status('3Al₂Si₂O₇ →(1100 °C+) 3Al₂O₃·2SiO₂ + 5SiO₂'), 'unbalanced');
});

test('words are reported as unreadable, never as balanced', () => {
  assert.equal(status('starch + I₂ → starch·I₂ (blue-black)'), 'unreadable');
  assert.equal(status('NaOH(s) + water → NaOH(aq)'), 'unreadable');
  assert.equal(status('cis-[Pt(NH₃)₂Cl₂] + DNA → Pt(NH₃)₂–DNA + 2Cl⁻'), 'unreadable');
  assert.equal(status('CH₃CHO + 2[Ag(NH₃)₂]⁺ → CH₃COO⁻ + 2Ag + ...'), 'unreadable');
  assert.equal(status('no arrow at all'), 'unreadable');
  assert.equal(status(''), 'unreadable');
});
