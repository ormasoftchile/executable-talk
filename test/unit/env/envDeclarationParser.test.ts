/**
 * Unit tests for EnvDeclarationParser
 * Per T005 — Tests written FIRST, must FAIL before implementation.
 *
 * Covers: valid env: block, env absent, env not array, missing name,
 * invalid name, duplicate names, unknown fields ignored, boolean coercion,
 * unrecognized validate rule, default preserved.
 */

import { expect } from 'chai';
import { EnvDeclarationParser } from '../../../src/env/envDeclarationParser';

describe('EnvDeclarationParser', () => {
  let parser: EnvDeclarationParser;

  beforeEach(() => {
    parser = new EnvDeclarationParser();
  });

  describe('parseEnvDeclarations', () => {
    it('should parse a valid env block with all properties', () => {
      const frontmatter = {
        env: [
          {
            name: 'REPO_PATH',
            description: 'Path to repository',
            required: true,
            secret: false,
            validate: 'directory',
            default: '/tmp/repo',
          },
        ],
      };

      const result = parser.parseEnvDeclarations(frontmatter);

      expect(result).to.have.length(1);
      expect(result[0].name).to.equal('REPO_PATH');
      expect(result[0].description).to.equal('Path to repository');
      expect(result[0].required).to.be.true;
      expect(result[0].secret).to.be.false;
      expect(result[0].validate).to.equal('directory');
      expect(result[0].default).to.equal('/tmp/repo');
    });

    it('should return empty array when env is absent', () => {
      const result = parser.parseEnvDeclarations({});

      expect(result).to.deep.equal([]);
    });

    it('should return empty array when env is undefined', () => {
      const result = parser.parseEnvDeclarations({ env: undefined });

      expect(result).to.deep.equal([]);
    });

    it('should throw DeckParseError when env is not an array', () => {
      expect(() => parser.parseEnvDeclarations({ env: 'not-array' }))
        .to.throw(/env.*array/i);
    });

    it('should throw DeckParseError when env is an object instead of array', () => {
      expect(() => parser.parseEnvDeclarations({ env: { name: 'test' } }))
        .to.throw(/env.*array/i);
    });

    it('should throw DeckParseError when entry is missing name', () => {
      expect(() => parser.parseEnvDeclarations({
        env: [{ description: 'no name here' }],
      })).to.throw(/name/i);
    });

    it('should throw DeckParseError when name is invalid identifier', () => {
      expect(() => parser.parseEnvDeclarations({
        env: [{ name: '123bad' }],
      })).to.throw(/invalid.*name/i);
    });

    it('should throw DeckParseError when name contains spaces', () => {
      expect(() => parser.parseEnvDeclarations({
        env: [{ name: 'HAS SPACE' }],
      })).to.throw(/invalid.*name/i);
    });

    it('should throw DeckParseError for duplicate names', () => {
      expect(() => parser.parseEnvDeclarations({
        env: [
          { name: 'DUP' },
          { name: 'DUP' },
        ],
      })).to.throw(/duplicate/i);
    });

    it('should silently ignore unknown fields (forward compatibility)', () => {
      const result = parser.parseEnvDeclarations({
        env: [{ name: 'VAR', unknownField: 'whatever', futureProperty: 42 }],
      });

      expect(result).to.have.length(1);
      expect(result[0].name).to.equal('VAR');
      // Should not have unknown fields on the result
      expect((result[0] as unknown as Record<string, unknown>)['unknownField']).to.be.undefined;
    });

    it('should coerce required to boolean (truthy string → true)', () => {
      const result = parser.parseEnvDeclarations({
        env: [{ name: 'VAR', required: 'yes' }],
      });

      expect(result[0].required).to.be.true;
    });

    it('should coerce secret to boolean (0 → false)', () => {
      const result = parser.parseEnvDeclarations({
        env: [{ name: 'VAR', secret: 0 }],
      });

      expect(result[0].secret).to.be.false;
    });

    it('should default required to false when absent', () => {
      const result = parser.parseEnvDeclarations({
        env: [{ name: 'VAR' }],
      });

      expect(result[0].required).to.be.false;
    });

    it('should default secret to false when absent', () => {
      const result = parser.parseEnvDeclarations({
        env: [{ name: 'VAR' }],
      });

      expect(result[0].secret).to.be.false;
    });

    it('should default description to empty string when absent', () => {
      const result = parser.parseEnvDeclarations({
        env: [{ name: 'VAR' }],
      });

      expect(result[0].description).to.equal('');
    });

    it('should throw DeckParseError for unrecognized validate rule', () => {
      expect(() => parser.parseEnvDeclarations({
        env: [{ name: 'VAR', validate: 'invalid_rule' }],
      })).to.throw(/validate|rule/i);
    });

    it('should accept all valid validation rules', () => {
      const rules = ['directory', 'file', 'command', 'url', 'port', 'regex:^test$'];
      for (const rule of rules) {
        const result = parser.parseEnvDeclarations({
          env: [{ name: 'VAR', validate: rule }],
        });
        expect(result[0].validate).to.equal(rule);
      }
    });

    it('should preserve default property', () => {
      const result = parser.parseEnvDeclarations({
        env: [{ name: 'BRANCH', default: 'main' }],
      });

      expect(result[0].default).to.equal('main');
    });

    it('should accept name starting with underscore', () => {
      const result = parser.parseEnvDeclarations({
        env: [{ name: '_PRIVATE' }],
      });

      expect(result[0].name).to.equal('_PRIVATE');
    });

    it('should parse multiple declarations preserving order', () => {
      const result = parser.parseEnvDeclarations({
        env: [
          { name: 'A', description: 'First' },
          { name: 'B', description: 'Second' },
          { name: 'C', description: 'Third' },
        ],
      });

      expect(result.map(d => d.name)).to.deep.equal(['A', 'B', 'C']);
    });
  });
});
