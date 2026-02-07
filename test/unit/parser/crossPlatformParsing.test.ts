/**
 * Unit tests for cross-platform command parsing from YAML
 * Per contracts/platform-resolver.md
 * T034 [US3]
 */

import { expect } from 'chai';
import * as yaml from 'js-yaml';
import { PlatformCommandMap } from '../../../src/actions/platformResolver';

/**
 * Helper: determine if a parsed command value is a PlatformCommandMap
 */
function isPlatformCommandMap(value: unknown): value is PlatformCommandMap {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  const validKeys = new Set(['macos', 'windows', 'linux', 'default']);
  const keys = Object.keys(obj);
  // Must have at least one valid key
  if (keys.length === 0) {
    return false;
  }
  // All keys must be valid platform keys
  return keys.every((k) => validKeys.has(k));
}

describe('Cross-Platform Command Parsing', () => {
  describe('YAML parsing of PlatformCommandMap', () => {
    it('should parse a platform map object with all three OS keys', () => {
      const yamlContent = `
type: terminal.run
command:
  macos: "open ."
  windows: "explorer ."
  linux: "xdg-open ."
name: file-browser
`;
      const parsed = yaml.load(yamlContent) as Record<string, unknown>;
      expect(parsed.type).to.equal('terminal.run');
      expect(isPlatformCommandMap(parsed.command)).to.be.true;

      const map = parsed.command as PlatformCommandMap;
      expect(map.macos).to.equal('open .');
      expect(map.windows).to.equal('explorer .');
      expect(map.linux).to.equal('xdg-open .');
    });

    it('should parse a platform map with default fallback', () => {
      const yamlContent = `
type: terminal.run
command:
  windows: "dir /b"
  default: "ls -la"
name: listing
`;
      const parsed = yaml.load(yamlContent) as Record<string, unknown>;
      const map = parsed.command as PlatformCommandMap;
      expect(isPlatformCommandMap(map)).to.be.true;
      expect(map.windows).to.equal('dir /b');
      expect(map.default).to.equal('ls -la');
    });

    it('should parse a simple string command unchanged', () => {
      const yamlContent = `
type: terminal.run
command: "npm test"
name: tests
`;
      const parsed = yaml.load(yamlContent) as Record<string, unknown>;
      expect(typeof parsed.command).to.equal('string');
      expect(parsed.command).to.equal('npm test');
      expect(isPlatformCommandMap(parsed.command)).to.be.false;
    });

    it('should parse a platform map with only default', () => {
      const yamlContent = `
type: terminal.run
command:
  default: "echo hello"
`;
      const parsed = yaml.load(yamlContent) as Record<string, unknown>;
      expect(isPlatformCommandMap(parsed.command)).to.be.true;
      expect((parsed.command as PlatformCommandMap).default).to.equal('echo hello');
    });

    it('should reject a map with invalid keys as not a PlatformCommandMap', () => {
      const yamlContent = `
type: terminal.run
command:
  macos: "open ."
  android: "am start ."
`;
      const parsed = yaml.load(yamlContent) as Record<string, unknown>;
      // 'android' is not a valid platform key, so this should not be recognized
      expect(isPlatformCommandMap(parsed.command)).to.be.false;
    });

    it('should reject an empty object as not a PlatformCommandMap', () => {
      const obj = {};
      expect(isPlatformCommandMap(obj)).to.be.false;
    });

    it('should reject null and arrays', () => {
      expect(isPlatformCommandMap(null)).to.be.false;
      expect(isPlatformCommandMap([1, 2, 3])).to.be.false;
      expect(isPlatformCommandMap(undefined)).to.be.false;
    });

    it('should parse a command with path placeholders as a plain string', () => {
      const yamlContent = `
type: terminal.run
command: "cd \${home}\${pathSep}projects && npm start"
`;
      const parsed = yaml.load(yamlContent) as Record<string, unknown>;
      expect(typeof parsed.command).to.equal('string');
      expect(parsed.command).to.include('${home}');
      expect(parsed.command).to.include('${pathSep}');
    });
  });
});
