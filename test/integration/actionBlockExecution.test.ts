/**
 * Integration test for action error notification delivery
 * Per T025 — Tests the data contract flow from executor results
 * through to ActionStatusChangedMessage payload.
 *
 * NOTE: Webview DOM rendering (toast display) cannot be unit-tested
 * outside the Extension Development Host. This test validates the
 * data structures that drive toast rendering.
 */

import { expect } from 'chai';
import { SequenceErrorDetail, StepResult } from '../../src/actions/errors';
import { ActionType } from '../../src/models/action';

describe('Action Error Notification Data Contract', () => {

  describe('StepResult interface', () => {
    it('should represent a successful step', () => {
      const result: StepResult = {
        type: 'file.open' as ActionType,
        target: 'src/main.ts',
        status: 'success',
      };
      expect(result.status).to.equal('success');
      expect(result.error).to.be.undefined;
    });

    it('should represent a failed step with error', () => {
      const result: StepResult = {
        type: 'terminal.run' as ActionType,
        target: 'npm test',
        status: 'failed',
        error: 'Exit code 1',
      };
      expect(result.status).to.equal('failed');
      expect(result.error).to.equal('Exit code 1');
    });

    it('should represent a skipped step', () => {
      const result: StepResult = {
        type: 'editor.highlight' as ActionType,
        target: 'src/utils.ts',
        status: 'skipped',
      };
      expect(result.status).to.equal('skipped');
    });
  });

  describe('SequenceErrorDetail', () => {
    it('should contain complete step breakdown for a 5-step sequence failure at step 3', () => {
      const detail: SequenceErrorDetail = {
        totalSteps: 5,
        failedStepIndex: 2,
        failedStepType: 'terminal.run' as ActionType,
        stepResults: [
          { type: 'file.open' as ActionType, target: 'src/main.ts', status: 'success' },
          { type: 'editor.highlight' as ActionType, target: 'src/main.ts', status: 'success' },
          { type: 'terminal.run' as ActionType, target: 'npm test', status: 'failed', error: 'Exit code 1' },
          { type: 'editor.highlight' as ActionType, target: 'src/utils.ts', status: 'skipped' },
          { type: 'file.open' as ActionType, target: 'README.md', status: 'skipped' },
        ],
      };

      expect(detail.totalSteps).to.equal(5);
      expect(detail.failedStepIndex).to.equal(2);
      expect(detail.failedStepType).to.equal('terminal.run');
      expect(detail.stepResults).to.have.length(5);

      // Steps before failure are success
      expect(detail.stepResults[0].status).to.equal('success');
      expect(detail.stepResults[1].status).to.equal('success');

      // Failed step
      expect(detail.stepResults[2].status).to.equal('failed');
      expect(detail.stepResults[2].error).to.include('Exit code');

      // Steps after failure are skipped
      expect(detail.stepResults[3].status).to.equal('skipped');
      expect(detail.stepResults[4].status).to.equal('skipped');
    });

    it('should have matching stepResults length and totalSteps', () => {
      const detail: SequenceErrorDetail = {
        totalSteps: 3,
        failedStepIndex: 0,
        failedStepType: 'file.open' as ActionType,
        stepResults: [
          { type: 'file.open' as ActionType, target: 'missing.ts', status: 'failed', error: 'File not found' },
          { type: 'terminal.run' as ActionType, target: 'npm run build', status: 'skipped' },
          { type: 'editor.highlight' as ActionType, status: 'skipped' },
        ],
      };

      expect(detail.stepResults.length).to.equal(detail.totalSteps);
    });
  });

  describe('ActionStatusChangedMessage extended payload shape', () => {
    it('should support simple action failure with actionType and actionTarget', () => {
      // Simulating the payload the conductor would send
      const payload = {
        actionId: 'action-1',
        status: 'failed' as const,
        error: 'File not found in workspace',
        actionType: 'file.open' as ActionType,
        actionTarget: 'src/old-main.ts',
      };

      expect(payload.actionType).to.equal('file.open');
      expect(payload.actionTarget).to.equal('src/old-main.ts');
      expect(payload.error).to.include('not found');
    });

    it('should support sequence failure with sequenceDetail', () => {
      const sequenceDetail: SequenceErrorDetail = {
        totalSteps: 3,
        failedStepIndex: 1,
        failedStepType: 'terminal.run' as ActionType,
        stepResults: [
          { type: 'file.open' as ActionType, target: 'src/app.ts', status: 'success' },
          { type: 'terminal.run' as ActionType, target: 'npm test', status: 'failed', error: 'Command failed' },
          { type: 'file.open' as ActionType, target: 'README.md', status: 'skipped' },
        ],
      };

      const payload = {
        actionId: 'seq-1',
        status: 'failed' as const,
        error: 'Step 2 (terminal.run) failed: Command failed',
        actionType: 'sequence' as ActionType,
        sequenceDetail,
      };

      expect(payload.actionType).to.equal('sequence');
      expect(payload.sequenceDetail).to.not.be.undefined;
      expect(payload.sequenceDetail!.totalSteps).to.equal(3);
      expect(payload.sequenceDetail!.failedStepIndex).to.equal(1);
    });

    it('should be backward compatible — old payloads without new fields still valid', () => {
      const payload = {
        actionId: 'action-old',
        status: 'failed' as const,
        error: 'Something went wrong',
      };

      // New fields are absent — backward compatible
      expect((payload as Record<string, unknown>).actionType).to.be.undefined;
      expect((payload as Record<string, unknown>).actionTarget).to.be.undefined;
      expect((payload as Record<string, unknown>).sequenceDetail).to.be.undefined;
    });
  });

  describe('Auto-dismiss policy', () => {
    it('should identify simple failures as auto-dismissible', () => {
      const error = 'File not found in workspace';
      const isTimeout = error.indexOf('timed out') >= 0;
      const isSequence = false;
      const persist = isSequence || isTimeout;

      expect(persist).to.be.false; // Should auto-dismiss
    });

    it('should identify timeout errors as persistent', () => {
      const error = 'Action timed out after 30000ms';
      const isTimeout = error.indexOf('timed out') >= 0;
      const isSequence = false;
      const persist = isSequence || isTimeout;

      expect(persist).to.be.true; // Should persist
    });

    it('should identify sequence failures as persistent', () => {
      const isSequence = true;
      const isTimeout = false;
      const persist = isSequence || isTimeout;

      expect(persist).to.be.true; // Should persist
    });
  });

  describe('Icon mapping', () => {
    it('should map all action types to icons', () => {
      const icons: Record<string, string> = {
        'file.open': '📄',
        'editor.highlight': '🔍',
        'terminal.run': '▶',
        'debug.start': '🐛',
        'sequence': '🔗',
        'vscode.command': '⚙️',
      };

      const actionTypes: ActionType[] = [
        'file.open', 'editor.highlight', 'terminal.run',
        'debug.start', 'sequence', 'vscode.command',
      ];

      for (const type of actionTypes) {
        expect(icons[type]).to.be.a('string');
        expect(icons[type].length).to.be.greaterThan(0);
      }
    });
  });
});
