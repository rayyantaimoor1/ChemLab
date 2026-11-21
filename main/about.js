/**
 * about.js — what Help > About says (Phase 10.2).
 *
 * WHY THESE ARE WRITTEN OUT HERE
 * The installer takes the app's name and copyright from the "build" section
 * of package.json. But electron-builder strips that section out of the
 * package.json it packs into the app, so the running app cannot read it:
 * the first version of this read pkg.build and the installed app crashed
 * before opening its window (found by scripts/smoke-packaged.mjs). So the
 * two lines live here, and tests/about.test.js fails if they ever drift
 * from package.json.
 */

export const ABOUT = {
  name: 'Virtual Chemistry Lab',
  copyright: '© 2026 Rayyan Taimoor',
  credits: 'Works fully offline. No account, no internet, nothing leaves this computer.',
};
