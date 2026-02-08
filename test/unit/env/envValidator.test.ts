/**
 * Unit tests for PreflightValidator Phase 6: Environment Validation (T021)
 * Tests written FIRST per TDD methodology.
 *
 * Covers: missing .deck.env → warning, malformed lines → warnings with line numbers,
 * required variable missing → error, validation rule failure → warning,
 * .gitignore not covering → warning, unused variable → info, all satisfied → no errors.
 */

import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PreflightValidator } from '../../../src/validation/preflightValidator';
import { ValidationContext } from '../../../src/validation/types';
import { Deck } from '../../../src/models/deck';
import { EnvDeclaration, ResolvedEnv, ResolvedVar } from '../../../src/models/env';

/**
 * Build a minimal Deck object for validation context.
 */
function buildDeck(filePath: string): Deck {
  return {
    filePath,
    title: 'Test Deck',
    slides: [],
    currentSlideIndex: 0,
    metadata: {},
    state: 'active',
    envDeclarations: [],
  };
}

/**
 * Build a minimal ValidationContext.
 */
function buildContext(overrides: Partial<ValidationContext> & { deck: Deck }): ValidationContext {
  return {
    workspaceRoot: path.dirname(overrides.deck.filePath),
    isTrusted: true,
    cancellationToken: { isCancellationRequested: false },
    ...overrides,
  };
}

/**
 * Build a ResolvedVar helper.
 */
function resolvedVar(name: string, overrides: Partial<ResolvedVar> = {}): ResolvedVar {
  const decl: EnvDeclaration = {
    name,
    description: `${name} desc`,
    required: false,
    secret: false,
    ...overrides.declaration,
  };
  return {
    name,
    declaration: decl,
    status: 'resolved',
    resolvedValue: 'value',
    displayValue: 'value',
    source: 'env-file',
    ...overrides,
  };
}

/**
 * Build a ResolvedEnv from a list of ResolvedVars.
 */
function buildResolvedEnv(vars: ResolvedVar[]): ResolvedEnv {
  const variables = new Map<string, ResolvedVar>();
  for (const v of vars) {
    variables.set(v.name, v);
  }
  const isComplete = !vars.some(
    v => v.status === 'missing-required' || v.status === 'resolved-invalid',
  );
  return {
    variables,
    isComplete,
    secrets: vars.filter(v => v.declaration.secret).map(v => v.name),
    secretValues: [],
  };
}

describe('PreflightValidator — Phase 6: Environment Validation', () => {
  let tmpDir: string;
  let deckFilePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-preflight-'));
    deckFilePath = path.join(tmpDir, 'test.deck.md');
    // Create a minimal .deck.md file
    fs.writeFileSync(deckFilePath, '---\ntitle: Test\n---\n# Slide 1\n');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should emit warning when .deck.env file is missing', async () => {
    const declarations: EnvDeclaration[] = [
      { name: 'PROJECT_ROOT', description: 'Root', required: true, secret: false },
    ];
    const resolved = buildResolvedEnv([
      resolvedVar('PROJECT_ROOT', {
        status: 'missing-required',
        resolvedValue: undefined,
        displayValue: '<missing>',
        source: 'unresolved',
        declaration: { name: 'PROJECT_ROOT', description: 'Root', required: true, secret: false },
      }),
    ]);

    const deck = buildDeck(deckFilePath);
    deck.envDeclarations = declarations;

    const context = buildContext({
      deck,
      envDeclarations: declarations,
      resolvedEnv: resolved,
    });

    const validator = new PreflightValidator();
    const report = await validator.validate(context);

    const envWarning = report.issues.find(
      i => i.source === 'env' && i.severity === 'warning' && i.message.includes('.deck.env'),
    );
    expect(envWarning).to.not.be.undefined;
    expect(envWarning!.message).to.include('No .deck.env file found');
  });

  it('should emit warnings for malformed .deck.env lines with line numbers', async () => {
    // Create a .deck.env with a malformed line
    const envFilePath = path.join(tmpDir, 'test.deck.env');
    fs.writeFileSync(envFilePath, 'GOOD_VAR=value\nbadline without equals\nANOTHER=ok\n');

    const declarations: EnvDeclaration[] = [
      { name: 'GOOD_VAR', description: 'Good', required: false, secret: false },
    ];
    const resolved = buildResolvedEnv([
      resolvedVar('GOOD_VAR', {
        declaration: { name: 'GOOD_VAR', description: 'Good', required: false, secret: false },
      }),
    ]);

    const deck = buildDeck(deckFilePath);
    deck.envDeclarations = declarations;

    const context = buildContext({
      deck,
      envDeclarations: declarations,
      resolvedEnv: resolved,
    });

    const validator = new PreflightValidator();
    const report = await validator.validate(context);

    const malformedWarning = report.issues.find(
      i => i.source === 'env' && i.message.toLowerCase().includes('malformed'),
    );
    expect(malformedWarning).to.not.be.undefined;
    expect(malformedWarning!.severity).to.equal('warning');
    // Should reference line number
    expect(malformedWarning!.message).to.match(/line\s+\d+/i);
  });

  it('should emit error for required variable that is missing', async () => {
    // Create a .deck.env file but without the required var
    const envFilePath = path.join(tmpDir, 'test.deck.env');
    fs.writeFileSync(envFilePath, '# empty\n');

    const declarations: EnvDeclaration[] = [
      { name: 'API_KEY', description: 'API key', required: true, secret: false },
    ];
    const resolved = buildResolvedEnv([
      resolvedVar('API_KEY', {
        status: 'missing-required',
        resolvedValue: undefined,
        displayValue: '<missing>',
        source: 'unresolved',
        declaration: { name: 'API_KEY', description: 'API key', required: true, secret: false },
      }),
    ]);

    const deck = buildDeck(deckFilePath);
    deck.envDeclarations = declarations;

    const context = buildContext({
      deck,
      envDeclarations: declarations,
      resolvedEnv: resolved,
    });

    const validator = new PreflightValidator();
    const report = await validator.validate(context);

    const requiredError = report.issues.find(
      i => i.source === 'env' && i.severity === 'error' && i.message.includes('API_KEY'),
    );
    expect(requiredError).to.not.be.undefined;
    expect(requiredError!.message).to.include('Required');
  });

  it('should emit warning for validation rule failure', async () => {
    const envFilePath = path.join(tmpDir, 'test.deck.env');
    fs.writeFileSync(envFilePath, 'PROJECT_DIR=/nonexistent/path\n');

    const declarations: EnvDeclaration[] = [
      {
        name: 'PROJECT_DIR',
        description: 'Project directory',
        required: true,
        secret: false,
        validate: 'directory',
      },
    ];
    const resolved = buildResolvedEnv([
      resolvedVar('PROJECT_DIR', {
        status: 'resolved-invalid',
        resolvedValue: '/nonexistent/path',
        displayValue: '/nonexistent/path',
        source: 'env-file',
        validationResult: {
          rule: 'directory',
          passed: false,
          message: 'Directory not found: /nonexistent/path',
        },
        declaration: declarations[0],
      }),
    ]);

    const deck = buildDeck(deckFilePath);
    deck.envDeclarations = declarations;

    const context = buildContext({
      deck,
      envDeclarations: declarations,
      resolvedEnv: resolved,
    });

    const validator = new PreflightValidator();
    const report = await validator.validate(context);

    const validationWarning = report.issues.find(
      i =>
        i.source === 'env' &&
        i.severity === 'warning' &&
        i.message.includes('PROJECT_DIR') &&
        i.message.includes('failed validation'),
    );
    expect(validationWarning).to.not.be.undefined;
  });

  it('should emit warning when .deck.env is not in .gitignore', async () => {
    // Create .deck.env
    const envFilePath = path.join(tmpDir, 'test.deck.env');
    fs.writeFileSync(envFilePath, 'VAR=value\n');
    // No .gitignore → should warn

    const declarations: EnvDeclaration[] = [
      { name: 'VAR', description: 'Var', required: false, secret: false },
    ];
    const resolved = buildResolvedEnv([
      resolvedVar('VAR', {
        declaration: { name: 'VAR', description: 'Var', required: false, secret: false },
      }),
    ]);

    const deck = buildDeck(deckFilePath);
    deck.envDeclarations = declarations;

    const context = buildContext({
      deck,
      envDeclarations: declarations,
      resolvedEnv: resolved,
    });

    const validator = new PreflightValidator();
    const report = await validator.validate(context);

    const gitignoreWarning = report.issues.find(
      i =>
        i.source === 'env' &&
        i.severity === 'warning' &&
        i.message.includes('.gitignore'),
    );
    expect(gitignoreWarning).to.not.be.undefined;
    expect(gitignoreWarning!.message).to.include('not covered by .gitignore');
  });

  it('should emit info for unused variable in .deck.env', async () => {
    const envFilePath = path.join(tmpDir, 'test.deck.env');
    fs.writeFileSync(envFilePath, 'DECLARED=val\nUNUSED_VAR=extra\n');

    const declarations: EnvDeclaration[] = [
      { name: 'DECLARED', description: 'D', required: false, secret: false },
    ];
    const resolved = buildResolvedEnv([
      resolvedVar('DECLARED', {
        declaration: { name: 'DECLARED', description: 'D', required: false, secret: false },
      }),
    ]);

    const deck = buildDeck(deckFilePath);
    deck.envDeclarations = declarations;

    const context = buildContext({
      deck,
      envDeclarations: declarations,
      resolvedEnv: resolved,
    });

    const validator = new PreflightValidator();
    const report = await validator.validate(context);

    const unusedInfo = report.issues.find(
      i =>
        i.source === 'env' &&
        i.severity === 'info' &&
        i.message.includes('UNUSED_VAR'),
    );
    expect(unusedInfo).to.not.be.undefined;
    expect(unusedInfo!.message).to.include('not declared');
  });

  it('should produce no env errors when all required variables are satisfied', async () => {
    const envFilePath = path.join(tmpDir, 'test.deck.env');
    fs.writeFileSync(envFilePath, 'PROJECT_ROOT=/some/path\nAPI_URL=https://api.example.com\n');

    // Create .gitignore with *.deck.env to avoid gitignore warning
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), '*.deck.env\n');

    const declarations: EnvDeclaration[] = [
      { name: 'PROJECT_ROOT', description: 'Root', required: true, secret: false },
      { name: 'API_URL', description: 'API URL', required: true, secret: false },
    ];
    const resolved = buildResolvedEnv([
      resolvedVar('PROJECT_ROOT', {
        resolvedValue: '/some/path',
        displayValue: '/some/path',
        declaration: declarations[0],
      }),
      resolvedVar('API_URL', {
        resolvedValue: 'https://api.example.com',
        displayValue: 'https://api.example.com',
        declaration: declarations[1],
      }),
    ]);

    const deck = buildDeck(deckFilePath);
    deck.envDeclarations = declarations;

    const context = buildContext({
      deck,
      envDeclarations: declarations,
      resolvedEnv: resolved,
    });

    const validator = new PreflightValidator();
    const report = await validator.validate(context);

    const envErrors = report.issues.filter(
      i => i.source === 'env' && i.severity === 'error',
    );
    expect(envErrors).to.have.length(0);
    expect(report.passed).to.be.true;
  });
});
