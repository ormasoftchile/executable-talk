/**
 * Unit tests for PlatformResolver
 * Per contracts/platform-resolver.md
 * T033 [US3]
 */

import { expect } from 'chai';
import {
  PlatformResolver,
  PlatformKey,
  PlatformCommandMap,
} from '../../../src/actions/platformResolver';

describe('PlatformResolver', () => {
  let resolver: PlatformResolver;

  beforeEach(() => {
    resolver = new PlatformResolver();
  });

  describe('getCurrentPlatform()', () => {
    it('should return a valid PlatformKey', () => {
      const platform = resolver.getCurrentPlatform();
      expect(['macos', 'windows', 'linux']).to.include(platform);
    });

    it('should map process.platform to the correct key', () => {
      const platform = resolver.getCurrentPlatform();
      // On test runner, we know process.platform
      if (process.platform === 'darwin') {
        expect(platform).to.equal('macos');
      } else if (process.platform === 'win32') {
        expect(platform).to.equal('windows');
      } else {
        expect(platform).to.equal('linux');
      }
    });
  });

  describe('resolve() — string passthrough', () => {
    it('should return the string command with source platform-specific', () => {
      const result = resolver.resolve('npm test');
      expect(result.command).to.equal('npm test');
      expect(result.source).to.equal('platform-specific');
      expect(result.platform).to.equal(resolver.getCurrentPlatform());
      expect(result.error).to.be.undefined;
    });

    it('should expand placeholders in a string command', () => {
      const result = resolver.resolve('cd ${home}');
      expect(result.command).to.not.include('${home}');
      expect(result.command).to.be.a('string');
      expect(result.command!.length).to.be.greaterThan(2);
    });
  });

  describe('resolve() — PlatformCommandMap', () => {
    it('should resolve the platform-specific command', () => {
      const currentPlatform = resolver.getCurrentPlatform();
      const map: PlatformCommandMap = {
        macos: 'open .',
        windows: 'explorer .',
        linux: 'xdg-open .',
      };
      const result = resolver.resolve(map);
      expect(result.command).to.equal(map[currentPlatform]);
      expect(result.source).to.equal('platform-specific');
      expect(result.platform).to.equal(currentPlatform);
    });

    it('should fall back to default when current platform key is missing', () => {
      const currentPlatform = resolver.getCurrentPlatform();
      // Build a map that does NOT include the current platform
      const map: PlatformCommandMap = { default: 'echo fallback' };
      const result = resolver.resolve(map);
      expect(result.command).to.equal('echo fallback');
      expect(result.source).to.equal('default');
      expect(result.platform).to.equal(currentPlatform);
    });

    it('should prefer platform-specific over default', () => {
      const currentPlatform = resolver.getCurrentPlatform();
      const map: PlatformCommandMap = {
        [currentPlatform]: 'specific-cmd',
        default: 'default-cmd',
      };
      const result = resolver.resolve(map);
      expect(result.command).to.equal('specific-cmd');
      expect(result.source).to.equal('platform-specific');
    });

    it('should return undefined command and error when no match and no default', () => {
      // Build a map with only a platform we are NOT on
      const otherPlatform: PlatformKey =
        resolver.getCurrentPlatform() === 'macos' ? 'windows' : 'macos';
      const map: PlatformCommandMap = {
        [otherPlatform]: 'some-cmd',
      };
      const result = resolver.resolve(map);
      expect(result.command).to.be.undefined;
      expect(result.source).to.equal('none');
      expect(result.error).to.be.a('string');
      expect(result.error).to.include(resolver.getCurrentPlatform());
    });

    it('should expand placeholders in platform-specific command', () => {
      const currentPlatform = resolver.getCurrentPlatform();
      const map: PlatformCommandMap = {
        [currentPlatform]: 'cd ${home}',
      };
      const result = resolver.resolve(map);
      expect(result.command).to.not.include('${home}');
    });

    it('should expand placeholders in default fallback', () => {
      const map: PlatformCommandMap = {
        default: 'echo ${pathSep}',
      };
      const result = resolver.resolve(map);
      expect(result.command).to.not.include('${pathSep}');
    });
  });

  describe('expandPlaceholders()', () => {
    it('should replace ${pathSep} with path.sep', () => {
      const result = resolver.expandPlaceholders('a${pathSep}b');
      const expected = process.platform === 'win32' ? 'a\\b' : 'a/b';
      expect(result).to.equal(expected);
    });

    it('should replace ${home} with os.homedir()', () => {
      const result = resolver.expandPlaceholders('${home}');
      expect(result).to.not.include('${home}');
      expect(result.length).to.be.greaterThan(0);
    });

    it('should replace ${pathDelimiter} with path.delimiter', () => {
      const result = resolver.expandPlaceholders('a${pathDelimiter}b');
      const expected = process.platform === 'win32' ? 'a;b' : 'a:b';
      expect(result).to.equal(expected);
    });

    it('should replace ${shell} placeholder', () => {
      // In test context, vscode.env.shell may not be available,
      // so the resolver should gracefully fall back
      const result = resolver.expandPlaceholders('${shell}');
      expect(result).to.be.a('string');
    });

    it('should handle multiple placeholders in one command', () => {
      const result = resolver.expandPlaceholders('cd ${home}${pathSep}projects');
      expect(result).to.not.include('${home}');
      expect(result).to.not.include('${pathSep}');
    });

    it('should leave unrecognized placeholders untouched', () => {
      const result = resolver.expandPlaceholders('${unknown}');
      expect(result).to.equal('${unknown}');
    });
  });

  describe('validate()', () => {
    it('should return valid when all platforms are covered', () => {
      const map: PlatformCommandMap = {
        macos: 'open .',
        windows: 'explorer .',
        linux: 'xdg-open .',
      };
      const result = resolver.validate(map);
      expect(result.isValid).to.be.true;
      expect(result.coveredPlatforms).to.have.lengthOf(3);
      expect(result.missingPlatforms).to.have.lengthOf(0);
      expect(result.hasDefault).to.be.false;
    });

    it('should return valid when current platform is covered', () => {
      const currentPlatform = resolver.getCurrentPlatform();
      const map: PlatformCommandMap = {
        [currentPlatform]: 'specific-cmd',
      };
      const result = resolver.validate(map);
      expect(result.isValid).to.be.true;
      expect(result.coveredPlatforms).to.include(currentPlatform);
    });

    it('should return valid when default covers missing platforms', () => {
      const map: PlatformCommandMap = {
        windows: 'explorer .',
        default: 'open .',
      };
      const result = resolver.validate(map);
      expect(result.isValid).to.be.true;
      expect(result.hasDefault).to.be.true;
      // Missing platforms are those without explicit entries AND no default
      // Since default exists, missingPlatforms should be empty
      expect(result.missingPlatforms).to.have.lengthOf(0);
    });

    it('should report missing platforms when current platform not covered and no default', () => {
      const otherPlatform: PlatformKey =
        resolver.getCurrentPlatform() === 'macos' ? 'windows' : 'macos';
      const map: PlatformCommandMap = {
        [otherPlatform]: 'some-cmd',
      };
      const result = resolver.validate(map);
      expect(result.isValid).to.be.false;
      expect(result.missingPlatforms).to.include(resolver.getCurrentPlatform());
      expect(result.warning).to.be.a('string');
    });

    it('should report hasDefault true when default exists', () => {
      const map: PlatformCommandMap = { default: 'echo hi' };
      const result = resolver.validate(map);
      expect(result.hasDefault).to.be.true;
      expect(result.isValid).to.be.true;
    });

    it('should list all explicitly covered platforms', () => {
      const map: PlatformCommandMap = {
        macos: 'cmd-mac',
        linux: 'cmd-linux',
      };
      const result = resolver.validate(map);
      expect(result.coveredPlatforms).to.include('macos');
      expect(result.coveredPlatforms).to.include('linux');
      expect(result.coveredPlatforms).to.not.include('windows');
    });
  });
});
