/**
 * Unit tests for SecretScrubber (T028)
 * Tests written FIRST per TDD methodology.
 *
 * Covers: single secret replaced, multiple secrets replaced, longer secrets first,
 * substring secrets handled, empty secret skipped, custom mask, no secrets unchanged,
 * case-sensitive matching.
 */

import { expect } from 'chai';
import { SecretScrubber } from '../../../src/env/secretScrubber';
import { ResolvedEnv, ResolvedVar, EnvDeclaration } from '../../../src/models/env';

/**
 * Build a ResolvedEnv with given secrets.
 */
function buildEnvWithSecrets(
  secretEntries: { name: string; value: string }[],
): ResolvedEnv {
  const variables = new Map<string, ResolvedVar>();
  const secrets: string[] = [];
  const secretValues: string[] = [];

  for (const { name, value } of secretEntries) {
    const decl: EnvDeclaration = {
      name,
      description: `${name} desc`,
      required: false,
      secret: true,
    };
    variables.set(name, {
      name,
      declaration: decl,
      status: 'resolved',
      resolvedValue: value,
      displayValue: '•••••',
      source: 'env-file',
    });
    secrets.push(name);
    secretValues.push(value);
  }

  // Sort secretValues longest first (same as EnvResolver behavior)
  secretValues.sort((a, b) => b.length - a.length);

  return {
    variables,
    isComplete: true,
    secrets,
    secretValues,
  };
}

describe('SecretScrubber', () => {
  let scrubber: SecretScrubber;

  beforeEach(() => {
    scrubber = new SecretScrubber();
  });

  it('should replace a single secret value with mask', () => {
    const env = buildEnvWithSecrets([{ name: 'TOKEN', value: 'abc123secret' }]);
    const result = scrubber.scrub('Error: abc123secret was rejected', env);
    expect(result).to.include('•••••');
    expect(result).to.not.include('abc123secret');
  });

  it('should replace multiple different secrets', () => {
    const env = buildEnvWithSecrets([
      { name: 'TOKEN', value: 'secret-token' },
      { name: 'PASSWORD', value: 'my-password' },
    ]);
    const result = scrubber.scrub('Auth: secret-token Password: my-password', env);
    expect(result).to.not.include('secret-token');
    expect(result).to.not.include('my-password');
    expect(result).to.include('•••••');
  });

  it('should replace longer secrets first to avoid partial replacement', () => {
    const env = buildEnvWithSecrets([
      { name: 'SHORT', value: 'abc' },
      { name: 'LONG', value: 'abcdef' },
    ]);
    // "abcdef" should be replaced first before "abc" can partially match
    const result = scrubber.scrub('Value is abcdef here', env);
    expect(result).to.not.include('abcdef');
    // The result should contain mask, not partial "def" left over
    expect(result).to.include('•••••');
  });

  it('should handle secret that is substring of another secret correctly', () => {
    const env = buildEnvWithSecrets([
      { name: 'SHORT', value: 'key' },
      { name: 'LONG', value: 'mykey123' },
    ]);
    const result = scrubber.scrub('Using mykey123 and key here', env);
    expect(result).to.not.include('mykey123');
    expect(result).to.not.include('key');
  });

  it('should skip empty secret values', () => {
    const env = buildEnvWithSecrets([
      { name: 'EMPTY', value: '' },
      { name: 'REAL', value: 'real-secret' },
    ]);
    const result = scrubber.scrub('Text with real-secret value', env);
    expect(result).to.not.include('real-secret');
    // Should not have infinite replacement from empty string
    expect(result).to.include('Text with');
  });

  it('should support custom mask string', () => {
    const env = buildEnvWithSecrets([{ name: 'TOKEN', value: 'mysecret' }]);
    const result = scrubber.scrub('Using mysecret here', env, '[REDACTED]');
    expect(result).to.include('[REDACTED]');
    expect(result).to.not.include('mysecret');
  });

  it('should return text unchanged when no secrets match', () => {
    const env = buildEnvWithSecrets([{ name: 'TOKEN', value: 'xyz123' }]);
    const result = scrubber.scrub('No secrets in this text', env);
    expect(result).to.equal('No secrets in this text');
  });

  it('should use case-sensitive matching', () => {
    const env = buildEnvWithSecrets([{ name: 'TOKEN', value: 'Secret' }]);
    const result = scrubber.scrub('The word secret is here but Secret is too', env);
    // "Secret" (capital S) should be replaced, "secret" (lowercase) should remain
    expect(result).to.include('secret');
    expect(result).to.not.match(/Secret/);
  });

  it('should return empty string for empty input', () => {
    const env = buildEnvWithSecrets([{ name: 'TOKEN', value: 'secret' }]);
    const result = scrubber.scrub('', env);
    expect(result).to.equal('');
  });

  it('should handle resolvedEnv with no secrets', () => {
    const env: ResolvedEnv = {
      variables: new Map(),
      isComplete: true,
      secrets: [],
      secretValues: [],
    };
    const result = scrubber.scrub('Some text', env);
    expect(result).to.equal('Some text');
  });
});
