import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolveHalloChristmasPhase, resolveHalloChristmasMessage } from '../src/theme/halloChristmasPhase';
import { ThemeMotif } from '../src/theme/motifs/ThemeMotif';
import { HALLO_CHRISTMAS_EFFECTS, THEME_EFFECTS, resolveEffectDefinition } from '../src/theme/effects/effectDefinitions';
import { HALLO_CHRISTMAS_LOADER_CONTENT, THEME_LOADER_CONTENT, resolveLoaderContentPool } from '../src/theme/themeLoaderContent';
import { SYSTEM_THEMES } from '../src/theme/themeRegistry';
import type { HalloChristmasPhase } from '../src/theme/themeTypes';

const dates: [number, number, HalloChristmasPhase][] = [
  [9, 30, 'halloween'], [9, 31, 'halloween'],
  [10, 1, 'remembrance'], [10, 2, 'remembrance'],
  [10, 3, 'christmas'], [11, 25, 'christmas'], [0, 1, 'halloween'],
];
for (const [month, day, phase] of dates) {
  test('local calendar boundary ' + (month + 1) + '/' + day, () => {
    for (const hour of [0, 12, 23]) {
      assert.equal(resolveHalloChristmasPhase(new Date(2026, month, day, hour, 59)), phase);
    }
  });
}

const greetings: Record<HalloChristmasPhase, { title: string; subtitle: string }> = {
  halloween: { title: 'Happy Halloween!', subtitle: 'Wishing everyone a fun and spook-tacular celebration!' },
  remembrance: { title: 'May our departed loved ones rest in eternal peace.', subtitle: 'Remembering them with love, prayer, and gratitude.' },
  christmas: { title: 'Merry Christmas!', subtitle: 'Wishing everyone peace, joy, and warmth this Christmas season.' },
};
for (const phase of Object.keys(greetings) as HalloChristmasPhase[]) {
  test(phase + ' greeting, exclusive artwork, effects, and content', () => {
    assert.deepEqual(resolveHalloChristmasMessage(phase), greetings[phase]);
    const markup = renderToStaticMarkup(React.createElement(ThemeMotif, { effectId: 'hallo-christmas', halloChristmasPhase: phase }));
    assert.ok(markup.includes('data-hallo-phase="' + phase + '"'));
    assert.ok(markup.includes('data-hallo-art="' + phase + '"'));
    for (const other of Object.keys(greetings).filter(other => other !== phase)) {
      assert.ok(!markup.includes('data-hallo-art="' + other + '"'));
    }
    assert.ok(markup.includes('aria-hidden="true"'));
    assert.equal(resolveEffectDefinition('hallo-christmas', phase), HALLO_CHRISTMAS_EFFECTS[phase]);
    assert.equal(resolveLoaderContentPool('hallo-christmas', null, phase), HALLO_CHRISTMAS_LOADER_CONTENT[phase]);
    const pool = HALLO_CHRISTMAS_LOADER_CONTENT[phase];
    assert.equal(pool.length, 8);
    assert.ok(pool.every(entry => entry.text.length <= 85));
    if (phase === 'remembrance') assert.ok(pool.every(entry => !/spooky|trick|halloween|christmas|evergreen/i.test(entry.text)));
    if (phase === 'halloween') assert.ok(pool.every(entry => !/christmas|merry|evergreen/i.test(entry.text)));
    if (phase === 'christmas') assert.ok(pool.every(entry => !/halloween|spooky|trick/i.test(entry.text)));
  });
}

test('remembrance is smaller, slower, and fainter than festive phases', () => {
  const calm = HALLO_CHRISTMAS_EFFECTS.remembrance;
  assert.equal(calm.kind, 'mote');
  assert.equal(calm.particles.length, 4);
  assert.ok(calm.particles.every(p => p.duration >= 24 && p.opacity < .18 && Math.abs(p.drift) < 3));
  for (const phase of ['halloween', 'christmas'] as const) {
    assert.ok(HALLO_CHRISTMAS_EFFECTS[phase].particles.length <= 14);
    assert.ok(HALLO_CHRISTMAS_EFFECTS[phase].particles.length > calm.particles.length);
  }
});

test('single selectable theme and unrelated content/effects remain unchanged', () => {
  assert.equal(SYSTEM_THEMES['hallo-christmas'].id, 'hallo-christmas');
  for (const phase of Object.keys(greetings) as HalloChristmasPhase[]) {
    assert.equal(resolveEffectDefinition('winter', phase), THEME_EFFECTS.winter);
    assert.equal(resolveLoaderContentPool('classic', null, phase), THEME_LOADER_CONTENT.classic);
    assert.equal(resolveLoaderContentPool('weather-sync', null, phase), THEME_LOADER_CONTENT.classic);
  }
  for (const id of ['halloween', 'all-souls', 'christmas']) assert.ok(!(id in SYSTEM_THEMES));
});
