import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { renderMermaid } from '../../dist/vendor/triton/index.js';
const require = createRequire(import.meta.url);
const { resolveAppearance } = require('@deckpilot/core/models/appearance');

function render(source) {
  const result = renderMermaid(source, { theme: 'executive', format: 'svg' });
  assert.ok(result.svg, result.warnings?.join('; '));
  assert.deepEqual(result.warnings, []);
  return result;
}

test('bundled flowchart edges render native animations', () => {
  const result = render('flowchart LR\n  A[Source] --> B[Output] @anim:particle\n');
  assert.match(result.svg, /<animateMotion\b/);
});

test('architecture renders with an explicit theme without altering its grammar', () => {
  const result = render('architecture-beta\nservice source(server)[Source]\nservice target(database)[Target]\nsource:R --> L:target\n');
  assert.match(result.svg, /Source/);
  assert.match(result.svg, /Target/);
});

test('all progressive list shapes retain stable grouped reveal IDs', () => {
  for (const style of ['bullets', 'numbered', 'block', 'box', 'tree', 'chevron', 'process', 'timeline',
    'pyramid', 'columns', 'cycle', 'matrix', 'funnel', 'stepup', 'venn']) {
    const result = render(`list\nstyle ${style}\nreveal sequence\n- Author\n- Present\n- Record\n`);
    assert.equal(result.reveal.steps.length, 3, style);
    assert.match(result.svg, /id="triton-reveal"/);
    for (const step of result.reveal.steps) {
      for (const id of step.enter) assert.ok(result.svg.includes(`id="${id}"`), id);
    }
  }
});

test('poster composition preserves child reveal tracks with unique group IDs', () => {
  const result = render('poster "Delivery"\n  columns 2\n  cell left\n    list\n    style process\n    - Author\n    - Present\n  end\n  cell right\n    list\n    style process\n    - Record\n    - Publish\n  end\n');
  assert.equal(result.reveal?.steps.length, 4);
  const ids = result.reveal.steps.flatMap(step => step.enter);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.equal(result.svg.split(`id="${id}"`).length - 1, 1, id);
});

test('adaptive modes preserve geometry and reveal identities', () => {
  const source = 'list\nstyle tree\nreveal layer\n- Story\n  - Markdown\n- Evidence\n  - Tests\n';
  const variants = [1, 2, 3, 4].map(kind => {
    const appearance = resolveAppearance({}, { kind });
    const result = renderMermaid(source, { appearance });
    assert.ok(result.svg, result.warnings?.join('; '));
    assert.deepEqual(result.warnings, []);
    assert.equal(result.appearance.mode, appearance.mode);
    assert.equal(result.appearance.contrast, appearance.contrast);
    assert.equal(result.appearance.backgroundPainted, false);
    assert.ok(result.svg.includes(appearance.palette.text));
    return result;
  });
  for (const result of variants) {
    assert.equal(result.svg.match(/viewBox="([^"]+)"/)[1], variants[0].svg.match(/viewBox="([^"]+)"/)[1]);
    assert.deepEqual(result.reveal, variants[0].reveal);
  }
});

test('incompatible explicit palettes keep an opaque canvas and diagnose transparency', () => {
  const appearance = resolveAppearance({}, { kind: 2 });
  const result = renderMermaid('flowchart LR\nA --> B\n', { appearance, mode: 'light', surface: 'transparent' });
  assert.equal(result.appearance.backgroundPainted, true);
  assert.match(result.svg, /fill="#FFFFFF"/);
  assert.ok(result.warnings.some(warning => warning.includes('opaque')));
});

test('inline fonts are omitted only for the matching font revision', () => {
  const appearance = resolveAppearance({}, { kind: 2 });
  const source = 'flowchart LR\nA --> B\n';
  assert.match(renderMermaid(source, { appearance }).svg, /@font-face/);
  assert.doesNotMatch(renderMermaid(source, { appearance, fontRevision: appearance.font.revision }).svg, /@font-face/);
});