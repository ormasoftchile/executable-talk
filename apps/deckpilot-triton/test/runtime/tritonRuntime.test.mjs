import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderMermaid } from '../../dist/vendor/triton/index.js';

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