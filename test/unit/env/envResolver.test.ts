/**
 * Unit tests for EnvResolver.resolveDeclarations()
 * Per T006 — Tests written FIRST, must FAIL before implementation.
 *
 * Covers: env-file resolution, default fallback, missing-required,
 * missing-optional, isComplete, secretValues sorted, displayValue
 * masking, required+default interaction, sync-only (no validation).
 */

import { expect } from 'chai';
import { EnvResolver } from '../../../src/env/envResolver';
import { EnvDeclaration, EnvFile } from '../../../src/models/env';

function makeDeclaration(overrides: Partial<EnvDeclaration> & { name: string }): EnvDeclaration {
  return {
    description: '',
    required: false,
    secret: false,
    ...overrides,
  };
}

function makeEnvFile(values: Record<string, string>): EnvFile {
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(values)) {
    map.set(k, v);
  }
  return {
    filePath: '/test/.deck.env',
    values: map,
    errors: [],
    exists: true,
  };
}

function emptyEnvFile(): EnvFile {
  return {
    filePath: '/test/.deck.env',
    values: new Map(),
    errors: [],
    exists: false,
  };
}

describe('EnvResolver', () => {
  let resolver: EnvResolver;

  beforeEach(() => {
    resolver = new EnvResolver();
  });

  describe('resolveDeclarations', () => {
    it('should resolve value from .deck.env with status resolved and source env-file', () => {
      const declarations = [makeDeclaration({ name: 'FOO' })];
      const envFile = makeEnvFile({ FOO: 'bar' });

      const result = resolver.resolveDeclarations(declarations, envFile);

      const v = result.variables.get('FOO')!;
      expect(v.status).to.equal('resolved');
      expect(v.source).to.equal('env-file');
      expect(v.resolvedValue).to.equal('bar');
    });

    it('should use default when not in file with status resolved and source default', () => {
      const declarations = [makeDeclaration({ name: 'BRANCH', default: 'main' })];
      const envFile = emptyEnvFile();

      const result = resolver.resolveDeclarations(declarations, envFile);

      const v = result.variables.get('BRANCH')!;
      expect(v.status).to.equal('resolved');
      expect(v.source).to.equal('default');
      expect(v.resolvedValue).to.equal('main');
    });

    it('should set missing-required when required var is absent and no default', () => {
      const declarations = [makeDeclaration({ name: 'TOKEN', required: true })];
      const envFile = emptyEnvFile();

      const result = resolver.resolveDeclarations(declarations, envFile);

      const v = result.variables.get('TOKEN')!;
      expect(v.status).to.equal('missing-required');
      expect(v.source).to.equal('unresolved');
    });

    it('should set missing-optional for optional var absent with no default', () => {
      const declarations = [makeDeclaration({ name: 'OPT', required: false })];
      const envFile = emptyEnvFile();

      const result = resolver.resolveDeclarations(declarations, envFile);

      const v = result.variables.get('OPT')!;
      expect(v.status).to.equal('missing-optional');
      expect(v.resolvedValue).to.equal('');
    });

    it('should set isComplete=true when all required vars are satisfied', () => {
      const declarations = [
        makeDeclaration({ name: 'A', required: true }),
        makeDeclaration({ name: 'B', required: false }),
      ];
      const envFile = makeEnvFile({ A: 'value' });

      const result = resolver.resolveDeclarations(declarations, envFile);

      expect(result.isComplete).to.be.true;
    });

    it('should set isComplete=false when any required var is missing', () => {
      const declarations = [
        makeDeclaration({ name: 'A', required: true }),
        makeDeclaration({ name: 'B', required: true }),
      ];
      const envFile = makeEnvFile({ A: 'value' });

      const result = resolver.resolveDeclarations(declarations, envFile);

      expect(result.isComplete).to.be.false;
    });

    it('should build secretValues sorted longest first', () => {
      const declarations = [
        makeDeclaration({ name: 'SHORT', secret: true }),
        makeDeclaration({ name: 'LONG', secret: true }),
      ];
      const envFile = makeEnvFile({ SHORT: 'ab', LONG: 'abcdef' });

      const result = resolver.resolveDeclarations(declarations, envFile);

      expect(result.secretValues).to.deep.equal(['abcdef', 'ab']);
    });

    it('should set displayValue to ••••• for secret variables', () => {
      const declarations = [makeDeclaration({ name: 'TOKEN', secret: true })];
      const envFile = makeEnvFile({ TOKEN: 'secret123' });

      const result = resolver.resolveDeclarations(declarations, envFile);

      expect(result.variables.get('TOKEN')!.displayValue).to.equal('•••••');
    });

    it('should set displayValue to <missing> for missing variables', () => {
      const declarations = [makeDeclaration({ name: 'ABSENT', required: true })];
      const envFile = emptyEnvFile();

      const result = resolver.resolveDeclarations(declarations, envFile);

      expect(result.variables.get('ABSENT')!.displayValue).to.equal('<missing>');
    });

    it('should set displayValue to the real value for non-secret resolved vars', () => {
      const declarations = [makeDeclaration({ name: 'PATH' })];
      const envFile = makeEnvFile({ PATH: '/usr/bin' });

      const result = resolver.resolveDeclarations(declarations, envFile);

      expect(result.variables.get('PATH')!.displayValue).to.equal('/usr/bin');
    });

    it('should still flag missing-required even when default is set (required takes precedence)', () => {
      const declarations = [makeDeclaration({ name: 'KEY', required: true, default: 'fallback' })];
      const envFile = emptyEnvFile();

      const result = resolver.resolveDeclarations(declarations, envFile);

      const v = result.variables.get('KEY')!;
      expect(v.status).to.equal('missing-required');
    });

    it('should NOT run validation — no resolved-invalid status, no validationResult', () => {
      const declarations = [makeDeclaration({ name: 'DIR', validate: 'directory' })];
      const envFile = makeEnvFile({ DIR: '/nonexistent' });

      const result = resolver.resolveDeclarations(declarations, envFile);

      const v = result.variables.get('DIR')!;
      // resolveDeclarations is sync, does NOT run validation
      expect(v.status).to.equal('resolved');
      expect(v.validationResult).to.be.undefined;
    });

    it('should track secrets list (variable names marked secret)', () => {
      const declarations = [
        makeDeclaration({ name: 'PUBLIC' }),
        makeDeclaration({ name: 'SECRET1', secret: true }),
        makeDeclaration({ name: 'SECRET2', secret: true }),
      ];
      const envFile = makeEnvFile({ PUBLIC: 'a', SECRET1: 'b', SECRET2: 'c' });

      const result = resolver.resolveDeclarations(declarations, envFile);

      expect(result.secrets).to.include('SECRET1');
      expect(result.secrets).to.include('SECRET2');
      expect(result.secrets).not.to.include('PUBLIC');
    });

    it('should return empty variables for no declarations', () => {
      const result = resolver.resolveDeclarations([], emptyEnvFile());

      expect(result.variables.size).to.equal(0);
      expect(result.isComplete).to.be.true;
    });

    it('should prefer env-file value over default', () => {
      const declarations = [makeDeclaration({ name: 'X', default: 'fallback' })];
      const envFile = makeEnvFile({ X: 'from-file' });

      const result = resolver.resolveDeclarations(declarations, envFile);

      const v = result.variables.get('X')!;
      expect(v.resolvedValue).to.equal('from-file');
      expect(v.source).to.equal('env-file');
    });
  });
});
