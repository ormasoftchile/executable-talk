import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

interface FragmentStub {
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
}

const source = fs.readFileSync(path.resolve(__dirname,
  '../../../packages/extension/src/webview/assets/presentation.js'), 'utf8');
const start = source.indexOf('  function renumberFragments()');
const implementation = source.slice(start, source.indexOf('  /**', start));

function numberFragments(keys: Array<string | null>): { count: number; indexes: number[] } {
  const indexes: number[] = [];
  const fragments: FragmentStub[] = keys.map((key, index) => ({
    getAttribute: () => key,
    setAttribute: (_name, value) => { indexes[index] = Number(value); },
  }));
  const count = vm.runInNewContext(`${implementation}\nrenumberFragments();`, {
    slideContent: { querySelectorAll: () => fragments },
  }) as number;
  return { count, indexes };
}

describe('Triton reveal fragment numbering', () => {
  it('keeps non-adjacent groups in one layer step', () => {
    expect(numberFragments(['0:1', '0:1', '0:2', '0:2', '0:1', '0:2']))
      .to.deep.equal({ count: 2, indexes: [1, 1, 2, 2, 1, 2] });
  });

  it('preserves surrounding content and keeps different diagrams independent', () => {
    expect(numberFragments([null, '0:1', '0:2', '0:1', null, '1:1', '1:2', '1:1', null]))
      .to.deep.equal({ count: 7, indexes: [1, 2, 3, 2, 4, 5, 6, 5, 7] });
  });

  it('is stable on recount and preserves ordinary fragments', () => {
    expect(numberFragments([null, null, null])).to.deep.equal({ count: 3, indexes: [1, 2, 3] });
    const keys = ['0:1', '0:2', '0:1'];
    expect(numberFragments(keys)).to.deep.equal(numberFragments(keys));
    expect(numberFragments([])).to.deep.equal({ count: 0, indexes: [] });
  });
});