/**
 * Unit tests for SceneStore
 * Per T021 — Tests written FIRST per TDD (Principle IV).
 *
 * Covers: save, get, restore, delete, list, loadAuthored,
 * getRuntimeCount, clear, 20-cap limit, authored read-only.
 */

import { expect } from 'chai';
import { SceneStore } from '../../../src/conductor/sceneStore';
import { createSnapshot } from '../../../src/models/snapshot';

function makeSnapshot(slideIndex: number) {
  return createSnapshot(slideIndex, `Test snapshot at slide ${slideIndex}`);
}

describe('SceneStore', () => {
  let store: SceneStore;

  beforeEach(() => {
    store = new SceneStore();
  });

  describe('save()', () => {
    it('should save a scene and return the entry', () => {
      const snapshot = makeSnapshot(5);
      const entry = store.save('demo-start', snapshot, 5);
      expect(entry.name).to.equal('demo-start');
      expect(entry.origin).to.equal('saved');
      expect(entry.slideIndex).to.equal(5);
      expect(entry.snapshot).to.equal(snapshot);
      expect(entry.timestamp).to.be.a('number');
    });

    it('should overwrite an existing runtime scene with the same name', () => {
      const snap1 = makeSnapshot(3);
      const snap2 = makeSnapshot(7);
      store.save('demo', snap1, 3);
      const entry = store.save('demo', snap2, 7);
      expect(entry.slideIndex).to.equal(7);
      expect(store.getRuntimeCount()).to.equal(1);
    });

    it('should throw if name matches an authored scene', () => {
      store.loadAuthored([{ name: 'intro', slide: 0 }]);
      const snapshot = makeSnapshot(0);
      expect(() => store.save('intro', snapshot, 0)).to.throw(/authored/i);
    });

    it('should throw if runtime scene limit (20) is reached and name is new', () => {
      for (let i = 0; i < 20; i++) {
        store.save(`scene-${i}`, makeSnapshot(i), i);
      }
      expect(store.getRuntimeCount()).to.equal(20);
      expect(() => store.save('scene-21', makeSnapshot(21), 21)).to.throw(/limit/i);
    });

    it('should allow overwriting even at the 20-cap limit', () => {
      for (let i = 0; i < 20; i++) {
        store.save(`scene-${i}`, makeSnapshot(i), i);
      }
      // Overwriting an existing scene should work
      expect(() => store.save('scene-0', makeSnapshot(0), 0)).to.not.throw();
    });
  });

  describe('get()', () => {
    it('should return undefined for non-existent scene', () => {
      expect(store.get('nonexistent')).to.be.undefined;
    });

    it('should return the saved scene entry', () => {
      store.save('test', makeSnapshot(3), 3);
      const entry = store.get('test');
      expect(entry).to.not.be.undefined;
      expect(entry!.name).to.equal('test');
    });

    it('should return an authored scene', () => {
      store.loadAuthored([{ name: 'intro', slide: 0 }]);
      const entry = store.get('intro');
      expect(entry).to.not.be.undefined;
      expect(entry!.origin).to.equal('authored');
    });
  });

  describe('restore()', () => {
    it('should return undefined for non-existent scene', () => {
      expect(store.restore('nonexistent')).to.be.undefined;
    });

    it('should return the scene entry with snapshot for a saved scene', () => {
      const snapshot = makeSnapshot(5);
      store.save('demo', snapshot, 5);
      const entry = store.restore('demo');
      expect(entry).to.not.be.undefined;
      expect(entry!.snapshot).to.equal(snapshot);
    });

    it('should return authored scene with null snapshot', () => {
      store.loadAuthored([{ name: 'intro', slide: 0 }]);
      const entry = store.restore('intro');
      expect(entry).to.not.be.undefined;
      expect(entry!.snapshot).to.be.null;
      expect(entry!.slideIndex).to.equal(0);
    });
  });

  describe('delete()', () => {
    it('should return false for non-existent scene', () => {
      expect(store.delete('nonexistent')).to.be.false;
    });

    it('should delete a runtime scene and return true', () => {
      store.save('demo', makeSnapshot(5), 5);
      expect(store.delete('demo')).to.be.true;
      expect(store.get('demo')).to.be.undefined;
    });

    it('should throw if attempting to delete an authored scene', () => {
      store.loadAuthored([{ name: 'intro', slide: 0 }]);
      expect(() => store.delete('intro')).to.throw(/authored/i);
    });

    it('should decrement runtime count after deletion', () => {
      store.save('scene-1', makeSnapshot(1), 1);
      store.save('scene-2', makeSnapshot(2), 2);
      expect(store.getRuntimeCount()).to.equal(2);
      store.delete('scene-1');
      expect(store.getRuntimeCount()).to.equal(1);
    });
  });

  describe('list()', () => {
    it('should return empty array when no scenes exist', () => {
      expect(store.list()).to.deep.equal([]);
    });

    it('should sort authored first (alphabetical), then saved (by timestamp)', () => {
      store.loadAuthored([
        { name: 'z-authored', slide: 10 },
        { name: 'a-authored', slide: 0 },
      ]);
      store.save('my-scene', makeSnapshot(5), 5);

      const entries = store.list();
      expect(entries).to.have.length(3);
      // Authored first, alphabetical
      expect(entries[0].name).to.equal('a-authored');
      expect(entries[0].origin).to.equal('authored');
      expect(entries[1].name).to.equal('z-authored');
      expect(entries[1].origin).to.equal('authored');
      // Saved last
      expect(entries[2].name).to.equal('my-scene');
      expect(entries[2].origin).to.equal('saved');
    });

    it('should sort multiple saved scenes by timestamp (oldest first)', () => {
      store.save('first', makeSnapshot(1), 1);
      store.save('second', makeSnapshot(2), 2);
      store.save('third', makeSnapshot(3), 3);

      const entries = store.list();
      const savedEntries = entries.filter(e => e.origin === 'saved');
      // Verify timestamp ordering
      for (let i = 1; i < savedEntries.length; i++) {
        expect(savedEntries[i].timestamp).to.be.gte(savedEntries[i - 1].timestamp);
      }
    });
  });

  describe('loadAuthored()', () => {
    it('should load authored scenes from definitions', () => {
      store.loadAuthored([
        { name: 'intro', slide: 0 },
        { name: 'demo', slide: 5 },
      ]);

      const entries = store.list();
      expect(entries).to.have.length(2);
      expect(entries[0].origin).to.equal('authored');
      expect(entries[0].snapshot).to.be.null;
    });

    it('should not count authored scenes toward runtime limit', () => {
      store.loadAuthored([
        { name: 'intro', slide: 0 },
        { name: 'demo', slide: 5 },
      ]);
      expect(store.getRuntimeCount()).to.equal(0);
    });

    it('should clear previous authored scenes when called again', () => {
      store.loadAuthored([{ name: 'old', slide: 0 }]);
      store.loadAuthored([{ name: 'new', slide: 1 }]);
      expect(store.get('old')).to.be.undefined;
      expect(store.get('new')).to.not.be.undefined;
    });
  });

  describe('getRuntimeCount()', () => {
    it('should return 0 when no runtime scenes exist', () => {
      expect(store.getRuntimeCount()).to.equal(0);
    });

    it('should count only runtime scenes, not authored', () => {
      store.loadAuthored([{ name: 'intro', slide: 0 }]);
      store.save('my-scene', makeSnapshot(5), 5);
      expect(store.getRuntimeCount()).to.equal(1);
    });
  });

  describe('clear()', () => {
    it('should remove all scenes', () => {
      store.loadAuthored([{ name: 'intro', slide: 0 }]);
      store.save('demo', makeSnapshot(5), 5);
      store.clear();
      expect(store.list()).to.have.length(0);
      expect(store.getRuntimeCount()).to.equal(0);
    });
  });

  // T042b [US5] — Authored scene lifecycle in SceneStore
  describe('Authored scene lifecycle (T042b)', () => {
    it('should initialize authored scenes with null snapshot via loadAuthored', () => {
      store.loadAuthored([
        { name: 'intro', slide: 0 },
        { name: 'live-demo', slide: 7 },
      ]);

      const intro = store.get('intro');
      expect(intro).to.not.be.undefined;
      expect(intro!.origin).to.equal('authored');
      expect(intro!.snapshot).to.be.null;

      const liveDemo = store.get('live-demo');
      expect(liveDemo).to.not.be.undefined;
      expect(liveDemo!.origin).to.equal('authored');
      expect(liveDemo!.snapshot).to.be.null;
    });

    it('should return authored entry with null snapshot on restore', () => {
      store.loadAuthored([{ name: 'intro', slide: 0 }]);

      const entry = store.restore('intro');
      expect(entry).to.not.be.undefined;
      expect(entry!.snapshot).to.be.null;
      expect(entry!.slideIndex).to.equal(0);
    });

    it('should throw when saving over an authored scene name', () => {
      store.loadAuthored([{ name: 'intro', slide: 0 }]);
      expect(() => store.save('intro', makeSnapshot(3), 3)).to.throw();
    });

    it('should show authored scenes first in list()', () => {
      store.loadAuthored([
        { name: 'z-last', slide: 0 },
        { name: 'a-first', slide: 5 },
      ]);
      store.save('my-save', makeSnapshot(3), 3);

      const list = store.list();
      expect(list).to.have.lengthOf(3);
      // Authored first, alphabetical
      expect(list[0].name).to.equal('a-first');
      expect(list[0].origin).to.equal('authored');
      expect(list[1].name).to.equal('z-last');
      expect(list[1].origin).to.equal('authored');
      // Saved last
      expect(list[2].name).to.equal('my-save');
      expect(list[2].origin).to.equal('saved');
    });

    it('should not count authored scenes toward runtime limit', () => {
      store.loadAuthored([{ name: 'intro', slide: 0 }]);

      // Fill to runtime limit
      for (let i = 0; i < 20; i++) {
        store.save(`scene-${i}`, makeSnapshot(i), i);
      }

      expect(store.getRuntimeCount()).to.equal(20);
      // Authored + 20 runtime = 21 total in list
      expect(store.list()).to.have.lengthOf(21);
    });

    it('should clear previous authored scenes when loadAuthored is called again', () => {
      store.loadAuthored([{ name: 'old', slide: 0 }]);
      expect(store.get('old')).to.not.be.undefined;

      store.loadAuthored([{ name: 'new', slide: 5 }]);
      expect(store.get('old')).to.be.undefined;
      expect(store.get('new')).to.not.be.undefined;
    });
  });
});
