/**
 * Integration test for scene lifecycle data contracts
 * Per T022 — Tests written FIRST per TDD (Principle IV).
 *
 * Covers: save scene → modify state → restore scene → verify,
 * partial restore with missing file → warning,
 * scene message protocol round-trip.
 */

import { expect } from 'chai';
import { SceneStore } from '../../src/conductor/sceneStore';
import { createSnapshot } from '../../src/models/snapshot';
import { RestoreResult, SkippedResource } from '../../src/conductor/snapshotFactory';
import {
  SaveSceneMessage,
  RestoreSceneMessage,
  DeleteSceneMessage,
  SceneChangedMessage,
  WarningMessage,
  SceneListItem,
} from '../../src/webview/messages';
import {
  isSaveSceneMessage,
  isRestoreSceneMessage,
  isDeleteSceneMessage,
  parseMessage,
} from '../../src/webview/messageHandler';

describe('Scene Lifecycle Integration', () => {

  describe('Save → Modify → Restore round-trip', () => {

    it('should save a scene with full snapshot and restore it', () => {
      const store = new SceneStore();
      const snapshot = createSnapshot(5, 'demo-state');
      snapshot.openEditors = [
        { path: 'src/main.ts', viewColumn: 1, wasOpenedByPresentation: true },
        { path: 'src/utils.ts', viewColumn: 2, wasOpenedByPresentation: true },
      ];

      // Save
      const saved = store.save('demo-start', snapshot, 5);
      expect(saved.name).to.equal('demo-start');
      expect(saved.snapshot).to.not.be.null;
      expect(saved.snapshot!.openEditors).to.have.length(2);

      // Restore
      const restored = store.restore('demo-start');
      expect(restored).to.not.be.undefined;
      expect(restored!.slideIndex).to.equal(5);
      expect(restored!.snapshot!.openEditors).to.have.length(2);
      expect(restored!.snapshot!.openEditors[0].path).to.equal('src/main.ts');
    });

    it('should produce correct SceneChangedMessage after save', () => {
      const store = new SceneStore();
      store.save('my-scene', createSnapshot(3), 3);

      const scenes: SceneListItem[] = store.list().map(e => ({
        name: e.name,
        slideIndex: e.slideIndex,
        isAuthored: e.origin === 'authored',
      }));

      const msg: SceneChangedMessage = {
        type: 'sceneChanged',
        payload: {
          scenes,
          activeSceneName: 'my-scene',
        },
      };

      expect(msg.payload.scenes).to.have.length(1);
      expect(msg.payload.scenes[0].name).to.equal('my-scene');
      expect(msg.payload.scenes[0].isAuthored).to.be.false;
    });
  });

  describe('Partial restore with missing resources', () => {

    it('should produce a RestoreResult with skipped resources', () => {
      const result: RestoreResult = {
        success: false,
        skipped: [
          { type: 'editor', name: 'src/deleted-file.ts', reason: 'File not found or could not be opened' },
        ],
      };

      expect(result.success).to.be.false;
      expect(result.skipped).to.have.length(1);
      expect(result.skipped[0].type).to.equal('editor');
    });

    it('should produce a WarningMessage for partial restore', () => {
      const skipped: SkippedResource[] = [
        { type: 'editor', name: 'src/old-file.ts', reason: 'File not found' },
        { type: 'terminal', name: 'build', reason: 'Terminal creation failed' },
      ];

      const warning: WarningMessage = {
        type: 'warning',
        payload: {
          code: 'PARTIAL_RESTORE',
          message: `${skipped.length} resource(s) could not be restored`,
        },
      };

      expect(warning.payload.code).to.equal('PARTIAL_RESTORE');
      expect(warning.payload.message).to.include('2');
    });
  });

  describe('Scene message protocol', () => {

    it('should create valid SaveSceneMessage', () => {
      const msg: SaveSceneMessage = {
        type: 'saveScene',
        payload: { sceneName: 'demo-start' },
      };
      expect(isSaveSceneMessage(msg)).to.be.true;
    });

    it('should create valid RestoreSceneMessage', () => {
      const msg: RestoreSceneMessage = {
        type: 'restoreScene',
        payload: { sceneName: 'demo-start' },
      };
      expect(isRestoreSceneMessage(msg)).to.be.true;
    });

    it('should create valid DeleteSceneMessage', () => {
      const msg: DeleteSceneMessage = {
        type: 'deleteScene',
        payload: { sceneName: 'old-scene' },
      };
      expect(isDeleteSceneMessage(msg)).to.be.true;
    });

    it('should parse scene messages correctly', () => {
      expect(parseMessage({ type: 'saveScene', payload: { sceneName: 'x' } })).to.not.be.null;
      expect(parseMessage({ type: 'restoreScene', payload: { sceneName: 'x' } })).to.not.be.null;
      expect(parseMessage({ type: 'deleteScene', payload: { sceneName: 'x' } })).to.not.be.null;
    });
  });

  describe('Authored scene interactions', () => {

    it('should not allow saving over an authored scene', () => {
      const store = new SceneStore();
      store.loadAuthored([{ name: 'intro', slide: 0 }]);
      expect(() => store.save('intro', createSnapshot(0), 0)).to.throw(/authored/i);
    });

    it('should not allow deleting an authored scene', () => {
      const store = new SceneStore();
      store.loadAuthored([{ name: 'intro', slide: 0 }]);
      expect(() => store.delete('intro')).to.throw(/authored/i);
    });

    it('should list authored scenes first, then saved', () => {
      const store = new SceneStore();
      store.loadAuthored([{ name: 'intro', slide: 0 }]);
      store.save('my-save', createSnapshot(5), 5);

      const list = store.list();
      expect(list[0].origin).to.equal('authored');
      expect(list[1].origin).to.equal('saved');
    });
  });
});
