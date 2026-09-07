/**
 * Unit tests for RecorderOrchestrator
 * Covers: configuration detection, metadata shape, template interpolation.
 *
 * Note: Actual process spawning is not tested here since it requires
 * the vscode API and real child processes. Integration tests cover that.
 * These tests verify the orchestrator's logic via its metadata output.
 */

import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { RecorderMetadata } from '../../../packages/core/src/models/recording';
import {
  applyWindowScopeToCommand,
  getRecorderConfig,
  waitForRecorderOutput,
} from '../../../packages/extension/src/recording/recorderOrchestrator';
import { buildWindowsBoundsScript } from '../../../packages/extension/src/recording/windowsCaptureBounds';

describe('RecorderOrchestrator — metadata model', () => {
  describe('recorder configuration', () => {
    const windowsCommand = 'ffmpeg -hide_banner -loglevel error -y -f gdigrab -draw_mouse 0 ' +
      '-framerate 30 -i desktop -vf "crop=trunc(iw/2)*2:trunc(ih/2)*2" ' +
      '-c:v libx264 -preset ultrafast -pix_fmt yuv420p "{{outputPath}}"';
    const originalGetConfiguration = vscode.workspace.getConfiguration;
    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')!;
    let settings: Record<string, string>;
    let legacySettings: Record<string, string>;

    beforeEach(() => {
      settings = {};
      legacySettings = {};
      Object.defineProperty(process, 'platform', { value: 'win32' });
      vscode.workspace.getConfiguration = ((section?: string) => ({
        get: (key: string) => (section === 'executableTalk.recording' ? legacySettings : settings)[key],
      })) as typeof vscode.workspace.getConfiguration;
    });

    afterEach(() => {
      vscode.workspace.getConfiguration = originalGetConfiguration;
      Object.defineProperty(process, 'platform', originalPlatform);
    });

    it('uses the FFmpeg default on Windows without configuration', () => {
      const config = getRecorderConfig();

      expect(config.startCommand).to.equal(windowsCommand);
      expect(config.windowScope).to.equal('focused');
      expect(config.stopCommand).to.equal('');
      expect(config.outputExtension).to.equal('mp4');
      const scopedCommand = applyWindowScopeToCommand(config.startCommand, 'win32', config.windowScope);
      expect(scopedCommand).to.include('-video_size {{windowWidth}}x{{windowHeight}} -i desktop');
      expect(scopedCommand).to.include('-vf "crop=trunc(iw/2)*2:trunc(ih/2)*2"');
      expect(scopedCommand).to.include('"{{outputPath}}"');
    });

    it('uses the Windows default when both command settings are empty', () => {
      settings.startCommand = '';
      legacySettings.startCommand = '';

      expect(getRecorderConfig().startCommand).to.equal(windowsCommand);
    });

    it('preserves a custom command ahead of the legacy command and default', () => {
      settings.startCommand = 'custom-recorder start';
      legacySettings.startCommand = 'legacy-recorder start';

      expect(getRecorderConfig().startCommand).to.equal(settings.startCommand);
    });

    it('preserves a legacy command when the current setting is empty', () => {
      settings.startCommand = '';
      legacySettings.startCommand = 'legacy-recorder start';

      expect(getRecorderConfig().startCommand).to.equal(legacySettings.startCommand);
    });

    it('preserves explicit full-screen capture with the Windows default', () => {
      settings.windowScope = 'screen';
      const config = getRecorderConfig();

      expect(config.startCommand).to.equal(windowsCommand);
      expect(applyWindowScopeToCommand(config.startCommand, 'win32', config.windowScope)).to.equal(windowsCommand);
    });

    for (const platform of ['darwin', 'linux']) {
      it(`does not apply the Windows default on ${platform}`, () => {
        Object.defineProperty(process, 'platform', { value: platform });

        expect(getRecorderConfig().startCommand).to.equal('');
        settings.startCommand = 'platform-recorder start';
        expect(getRecorderConfig().startCommand).to.equal(settings.startCommand);
      });
    }
  });

  describe('recorder readiness', () => {
    it('waits until the output file contains media bytes', async () => {
      const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'deckpilot-recorder-'));
      const outputPath = path.join(directory, 'capture.mp4');
      let settled = false;

      try {
        const ready = waitForRecorderOutput(outputPath, 500, 10)
          .then(result => {
            settled = true;
            return result;
          });
        await new Promise(resolve => setTimeout(resolve, 25));
        expect(settled).to.equal(false);

        await fs.promises.writeFile(outputPath, Buffer.from('media'));
        expect(await ready).to.equal(true);
      } finally {
        await fs.promises.rm(directory, { recursive: true, force: true });
      }
    });
  });

  describe('Windows capture target selection', () => {
    it('should constrain a plain gdigrab desktop command to the focused window', () => {
      const command = applyWindowScopeToCommand(
        'ffmpeg -y -f gdigrab -framerate 30 -i desktop -c:v libx264 {{outputPath}}',
        'win32',
        'focused',
      );

      expect(command).to.include('-offset_x {{windowX}}');
      expect(command).to.include('-offset_y {{windowY}}');
      expect(command).to.include('-video_size {{windowWidth}}x{{windowHeight}}');
      expect(command.indexOf('-video_size')).to.be.lessThan(command.indexOf('-i desktop'));
    });

    it('should preserve full-desktop capture when screen scope is explicit', () => {
      const template = 'ffmpeg -f gdigrab -i desktop {{outputPath}}';

      expect(applyWindowScopeToCommand(template, 'win32', 'screen')).to.equal(template);
    });

    it('should use the exact window handle captured by the invoking VS Code window', () => {
      const script = buildWindowsBoundsScript('4242');

      expect(script).to.include('$hwnd = [IntPtr]4242');
      expect(script).not.to.include('ParentProcessId');
    });
  });

  describe('RecorderMetadata', () => {
    it('should represent unconfigured state', () => {
      const meta: RecorderMetadata = {
        configured: false,
        started: false,
        stopped: false,
      };
      expect(meta.configured).to.be.false;
      expect(meta.started).to.be.false;
      expect(meta.outputPath).to.be.undefined;
      expect(meta.error).to.be.undefined;
    });

    it('should represent configured but failed state', () => {
      const meta: RecorderMetadata = {
        configured: true,
        started: false,
        stopped: false,
        startCommand: 'ffmpeg -f gdigrab -i desktop out.mp4',
        error: 'Recorder failed to start: spawn ffmpeg ENOENT',
      };
      expect(meta.configured).to.be.true;
      expect(meta.started).to.be.false;
      expect(meta.error).to.include('ENOENT');
    });

    it('should represent successful session', () => {
      const meta: RecorderMetadata = {
        configured: true,
        started: true,
        stopped: true,
        outputPath: '/recordings/session-abc.mp4',
        startCommand: 'ffmpeg -f gdigrab -i desktop /recordings/session-abc.mp4',
        stopCommand: 'taskkill /IM ffmpeg.exe /F',
      };
      expect(meta.configured).to.be.true;
      expect(meta.started).to.be.true;
      expect(meta.stopped).to.be.true;
      expect(meta.outputPath).to.equal('/recordings/session-abc.mp4');
      expect(meta.error).to.be.undefined;
    });

    it('should serialize cleanly in JSON', () => {
      const meta: RecorderMetadata = {
        configured: true,
        started: true,
        stopped: true,
        outputPath: 'C:\\recordings\\session-123.mp4',
        startCommand: 'obs-cli recording start',
        stopCommand: 'obs-cli recording stop',
      };
      const json = JSON.parse(JSON.stringify(meta));
      expect(json.configured).to.equal(true);
      expect(json.outputPath).to.equal('C:\\recordings\\session-123.mp4');
    });
  });

  describe('template interpolation logic', () => {
    // Test the interpolation pattern used by RecorderOrchestrator
    function interpolate(template: string, sessionId: string, outputPath: string): string {
      return template
        .replace(/\{\{outputPath\}\}/g, outputPath)
        .replace(/\{\{sessionId\}\}/g, sessionId);
    }

    it('should replace {{outputPath}}', () => {
      const result = interpolate(
        'ffmpeg -f gdigrab -i desktop {{outputPath}}',
        'sess-1',
        '/out/video.mp4',
      );
      expect(result).to.equal('ffmpeg -f gdigrab -i desktop /out/video.mp4');
    });

    it('should replace {{sessionId}}', () => {
      const result = interpolate(
        'recorder start --id={{sessionId}}',
        'abc-123',
        '/out/video.mp4',
      );
      expect(result).to.equal('recorder start --id=abc-123');
    });

    it('should replace multiple occurrences', () => {
      const result = interpolate(
        '{{outputPath}} and {{outputPath}} with {{sessionId}}',
        'sess',
        '/video.mp4',
      );
      expect(result).to.equal('/video.mp4 and /video.mp4 with sess');
    });

    it('should leave template unchanged when no placeholders', () => {
      const result = interpolate('taskkill /IM ffmpeg.exe /F', 'sess', '/v.mp4');
      expect(result).to.equal('taskkill /IM ffmpeg.exe /F');
    });

    it('should handle empty template', () => {
      const result = interpolate('', 'sess', '/v.mp4');
      expect(result).to.equal('');
    });
  });

  describe('session integration shape', () => {
    it('recording-session.json should include recorder field', () => {
      // Verify the shape of a session with recorder metadata
      const session = {
        sessionId: 'test-123',
        deckPath: '/deck.md',
        events: [],
        segments: [],
        ignoredIntervals: [],
        manualMarkers: [],
        recorder: {
          configured: true,
          started: true,
          stopped: true,
          outputPath: '/recordings/session-test-123.mp4',
        } as RecorderMetadata,
        exportMetadata: {
          generatedAt: Date.now(),
          extensionVersion: '0.5.7',
          platform: 'win32',
          exportFormats: ['json', 'markdown', 'srt'],
        },
      };

      const json = JSON.parse(JSON.stringify(session));
      expect(json.recorder).to.exist;
      expect(json.recorder.outputPath).to.include('test-123');
    });
  });
});
