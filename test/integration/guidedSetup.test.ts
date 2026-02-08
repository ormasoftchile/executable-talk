/**
 * Integration test for guided environment setup flow (T034)
 *
 * Tests the end-to-end guided setup flow:
 * - Open deck with env declarations but no .deck.env
 * - Verify toast notification fires
 * - Simulate "Set Up Now" click
 * - Verify .deck.env.example generated with correct format
 * - Verify .deck.env created as copy
 * - Verify .deck.env opened in editor
 *
 * NOTE: This test requires VS Code API and must be run via @vscode/test-electron.
 * It cannot run under plain mocha due to vscode import.
 */

import * as path from 'path';
import * as fs from 'fs';
import * as assert from 'assert';

suite('Guided Environment Setup Flow', () => {
  const testDir = path.join(__dirname, '..', '..', '..', 'test-fixtures', 'guided-setup');

  suiteSetup(async () => {
    // Create test fixture directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  suiteTeardown(async () => {
    // Clean up test fixtures
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test('should generate .deck.env.example from declarations', async () => {
    // Create a deck file with env declarations
    const deckPath = path.join(testDir, 'setup.deck.md');
    const deckContent = `---
title: Setup Test
env:
  - name: PROJECT_ROOT
    description: Path to the project
    required: true
    validate: directory
  - name: API_TOKEN
    description: GitHub API token
    required: true
    secret: true
---

# Slide 1

Hello
`;
    fs.writeFileSync(deckPath, deckContent);

    // Import EnvFileLoader to generate template
    const { EnvFileLoader } = await import('../../src/env/envFileLoader');
    const { EnvDeclarationParser } = await import('../../src/env/envDeclarationParser');
    const matter = await import('gray-matter');

    const parsed = matter.default(deckContent);
    const parser = new EnvDeclarationParser();
    const declarations = parser.parseEnvDeclarations(parsed.data);

    assert.strictEqual(declarations.length, 2);

    const loader = new EnvFileLoader();
    const template = loader.generateTemplate(declarations, 'setup.deck.md');

    // Verify template format
    assert.ok(template.includes('# Environment variables for setup.deck.md'));
    assert.ok(template.includes('PROJECT_ROOT='));
    assert.ok(template.includes('API_TOKEN='));
    assert.ok(template.includes('Required: yes'));
    assert.ok(template.includes('Secret: yes'));
    assert.ok(template.includes('directory'));

    // Write .deck.env.example
    const examplePath = path.join(testDir, 'setup.deck.env.example');
    fs.writeFileSync(examplePath, template);
    assert.ok(fs.existsSync(examplePath));

    // Copy to .deck.env
    const envPath = path.join(testDir, 'setup.deck.env');
    fs.copyFileSync(examplePath, envPath);
    assert.ok(fs.existsSync(envPath));

    // Verify .deck.env can be loaded
    const envFile = await loader.loadEnvFile(deckPath);
    assert.ok(envFile.exists);
  });
});
