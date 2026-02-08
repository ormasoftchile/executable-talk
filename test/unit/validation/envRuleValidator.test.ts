/**
 * Unit tests for EnvRuleValidator (T020)
 * Tests written FIRST per TDD methodology.
 */

import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EnvRuleValidator } from '../../../src/validation/envRuleValidator';
import { EnvValidationContext } from '../../../src/models/env';

describe('EnvRuleValidator', () => {
  let validator: EnvRuleValidator;
  let tmpDir: string;
  let ctx: EnvValidationContext;

  beforeEach(() => {
    validator = new EnvRuleValidator();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-rule-'));
    ctx = { workspaceRoot: tmpDir, deckDirectory: tmpDir };
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('isValidRule', () => {
    it('should recognize directory rule', () => {
      expect(validator.isValidRule('directory')).to.be.true;
    });
    it('should recognize file rule', () => {
      expect(validator.isValidRule('file')).to.be.true;
    });
    it('should recognize command rule', () => {
      expect(validator.isValidRule('command')).to.be.true;
    });
    it('should recognize url rule', () => {
      expect(validator.isValidRule('url')).to.be.true;
    });
    it('should recognize port rule', () => {
      expect(validator.isValidRule('port')).to.be.true;
    });
    it('should recognize regex: rule', () => {
      expect(validator.isValidRule('regex:^\\d+$')).to.be.true;
    });
    it('should reject unknown rule', () => {
      expect(validator.isValidRule('unknown')).to.be.false;
    });
  });

  describe('validateValue — directory', () => {
    it('should pass for an existing directory', async () => {
      const dir = path.join(tmpDir, 'mydir');
      fs.mkdirSync(dir);
      const result = await validator.validateValue(dir, 'directory', ctx);
      expect(result.passed).to.be.true;
      expect(result.rule).to.equal('directory');
    });

    it('should fail for a missing directory', async () => {
      const result = await validator.validateValue(
        path.join(tmpDir, 'nonexistent'),
        'directory',
        ctx,
      );
      expect(result.passed).to.be.false;
    });

    it('should fail for a file (not a directory)', async () => {
      const file = path.join(tmpDir, 'file.txt');
      fs.writeFileSync(file, 'content');
      const result = await validator.validateValue(file, 'directory', ctx);
      expect(result.passed).to.be.false;
    });
  });

  describe('validateValue — file', () => {
    it('should pass for an existing file', async () => {
      const file = path.join(tmpDir, 'exists.txt');
      fs.writeFileSync(file, 'content');
      const result = await validator.validateValue(file, 'file', ctx);
      expect(result.passed).to.be.true;
      expect(result.rule).to.equal('file');
    });

    it('should fail for a missing file', async () => {
      const result = await validator.validateValue(
        path.join(tmpDir, 'missing.txt'),
        'file',
        ctx,
      );
      expect(result.passed).to.be.false;
    });
  });

  describe('validateValue — command', () => {
    it('should pass for a known command (node)', async () => {
      const result = await validator.validateValue('node', 'command', ctx);
      expect(result.passed).to.be.true;
    });

    it('should fail for a nonexistent command', async () => {
      const result = await validator.validateValue(
        'zzznonexistentcommand999',
        'command',
        ctx,
      );
      expect(result.passed).to.be.false;
    });
  });

  describe('validateValue — url', () => {
    it('should pass for valid https URL', async () => {
      const result = await validator.validateValue('https://api.example.com', 'url', ctx);
      expect(result.passed).to.be.true;
    });

    it('should fail for ftp URL', async () => {
      const result = await validator.validateValue('ftp://files.example.com', 'url', ctx);
      expect(result.passed).to.be.false;
    });

    it('should fail for malformed URL', async () => {
      const result = await validator.validateValue('not-a-url', 'url', ctx);
      expect(result.passed).to.be.false;
    });
  });

  describe('validateValue — port', () => {
    it('should pass for valid port 3000', async () => {
      const result = await validator.validateValue('3000', 'port', ctx);
      expect(result.passed).to.be.true;
    });

    it('should fail for 0', async () => {
      const result = await validator.validateValue('0', 'port', ctx);
      expect(result.passed).to.be.false;
    });

    it('should fail for 99999', async () => {
      const result = await validator.validateValue('99999', 'port', ctx);
      expect(result.passed).to.be.false;
    });

    it('should fail for non-numeric value', async () => {
      const result = await validator.validateValue('abc', 'port', ctx);
      expect(result.passed).to.be.false;
    });
  });

  describe('validateValue — regex', () => {
    it('should pass when value matches pattern', async () => {
      const result = await validator.validateValue('12345', 'regex:^\\d+$', ctx);
      expect(result.passed).to.be.true;
    });

    it('should fail when value does not match', async () => {
      const result = await validator.validateValue('abc', 'regex:^\\d+$', ctx);
      expect(result.passed).to.be.false;
    });

    it('should fail for invalid regex pattern', async () => {
      const result = await validator.validateValue('test', 'regex:[invalid', ctx);
      expect(result.passed).to.be.false;
    });
  });
});
