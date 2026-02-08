/**
 * Integration test for end-to-end env resolution (T012)
 *
 * Scenario: Parse env declarations from frontmatter data (as gray-matter
 * would produce), load .deck.env, resolve declarations, interpolate for
 * display (secret masked) and for execution (secret resolved).
 *
 * NOTE: parseDeck() transitively imports vscode (via renderer). These
 * tests use EnvDeclarationParser directly with gray-matter output to
 * avoid the vscode dependency — the pipeline is the same.
 */

import { expect } from 'chai';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import matter from 'gray-matter';
import { EnvFileLoader, EnvDeclarationParser, EnvResolver } from '../../src/env';

describe('End-to-end env resolution', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-e2e-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should resolve env vars through the full pipeline', async () => {
    // 1. Create a deck file with env declarations and {{VAR}} action params
    const deckContent = `---
title: Env E2E Test
env:
  - name: PROJECT_ROOT
    description: Path to the project
    required: true
  - name: API_KEY
    description: API authentication key
    required: true
    secret: true
  - name: BRANCH
    description: Git branch
    default: main
---

# Slide 1

[Run deploy](action:terminal.run?command=cd+{{PROJECT_ROOT}}+%26%26+git+checkout+{{BRANCH}})

---

# Slide 2

[Call API](action:terminal.run?command=curl+-H+"Authorization:+Bearer+{{API_KEY}}"+https://api.example.com)
`;
    const deckFilePath = path.join(tmpDir, 'test.deck.md');
    fs.writeFileSync(deckFilePath, deckContent);

    // 2. Create the .deck.env sidecar file
    const envContent = `# Environment values
PROJECT_ROOT=/home/user/myapp
API_KEY=sk-super-secret-key-12345
`;
    const envFilePath = path.join(tmpDir, 'test.deck.env');
    fs.writeFileSync(envFilePath, envContent);

    // 3. Parse frontmatter with gray-matter (same as parseDeck does internally)
    const { data: metadata } = matter(deckContent);

    // 4. Parse env declarations from frontmatter
    const parser = new EnvDeclarationParser();
    const declarations = parser.parseEnvDeclarations(metadata as Record<string, unknown>);
    expect(declarations).to.have.length(3);

    // 5. Load .deck.env
    const loader = new EnvFileLoader();
    const envFile = await loader.loadEnvFile(deckFilePath);
    expect(envFile.exists).to.be.true;
    expect(envFile.values.get('PROJECT_ROOT')).to.equal('/home/user/myapp');
    expect(envFile.values.get('API_KEY')).to.equal('sk-super-secret-key-12345');

    // 6. Resolve declarations
    const resolver = new EnvResolver();
    const resolved = resolver.resolveDeclarations(declarations, envFile);

    expect(resolved.isComplete).to.be.true;
    expect(resolved.variables.get('PROJECT_ROOT')!.status).to.equal('resolved');
    expect(resolved.variables.get('API_KEY')!.status).to.equal('resolved');
    expect(resolved.variables.get('BRANCH')!.status).to.equal('resolved');
    expect(resolved.variables.get('BRANCH')!.source).to.equal('default');

    // 7. Interpolate for display — secrets should be masked
    const displayParams = resolver.interpolateForDisplay(
      { command: 'cd {{PROJECT_ROOT}} && curl -H "Authorization: Bearer {{API_KEY}}" https://api.example.com' },
      resolved,
    );
    expect(displayParams.command).to.equal(
      'cd /home/user/myapp && curl -H "Authorization: Bearer {{API_KEY}}" https://api.example.com'
    );

    // 8. Interpolate for execution — secrets should be resolved
    const execParams = resolver.interpolateForExecution(
      { command: 'cd {{PROJECT_ROOT}} && curl -H "Authorization: Bearer {{API_KEY}}" https://api.example.com' },
      resolved,
    );
    expect(execParams.command).to.equal(
      'cd /home/user/myapp && curl -H "Authorization: Bearer sk-super-secret-key-12345" https://api.example.com'
    );

    // 9. Verify secrets tracking
    expect(resolved.secrets).to.include('API_KEY');
    expect(resolved.secrets).not.to.include('PROJECT_ROOT');
    expect(resolved.secretValues).to.include('sk-super-secret-key-12345');
  });

  it('should handle missing .deck.env gracefully with defaults', async () => {
    const deckContent = `---
title: No Env File
env:
  - name: BRANCH
    default: develop
---

# Slide 1

[Checkout](action:terminal.run?command=git+checkout+{{BRANCH}})
`;
    const deckFilePath = path.join(tmpDir, 'noenv.deck.md');
    fs.writeFileSync(deckFilePath, deckContent);

    // No .deck.env file created

    const parser = new EnvDeclarationParser();
    const { data: noEnvMeta } = matter(deckContent);
    const declarations = parser.parseEnvDeclarations(noEnvMeta as Record<string, unknown>);

    const loader = new EnvFileLoader();
    const envFile = await loader.loadEnvFile(deckFilePath);
    expect(envFile.exists).to.be.false;

    const resolver = new EnvResolver();
    const resolved = resolver.resolveDeclarations(declarations, envFile);

    expect(resolved.isComplete).to.be.true;
    expect(resolved.variables.get('BRANCH')!.source).to.equal('default');
    expect(resolved.variables.get('BRANCH')!.resolvedValue).to.equal('develop');

    const execParams = resolver.interpolateForExecution(
      { command: 'git checkout {{BRANCH}}' },
      resolved,
    );
    expect(execParams.command).to.equal('git checkout develop');
  });

  it('should coexist with ${home} platform placeholders', async () => {
    const deckContent = `---
title: Mixed Placeholders
env:
  - name: PROJ
    default: myapp
---

# Slide 1

[Open](action:file.open?path=\${home}/projects/{{PROJ}}/README.md)
`;
    const deckFilePath = path.join(tmpDir, 'mixed.deck.md');
    fs.writeFileSync(deckFilePath, deckContent);

    const parser = new EnvDeclarationParser();
    const { data: mixedMeta } = matter(deckContent);
    const declarations = parser.parseEnvDeclarations(mixedMeta as Record<string, unknown>);

    const loader = new EnvFileLoader();
    const envFile = await loader.loadEnvFile(deckFilePath);

    const resolver = new EnvResolver();
    const resolved = resolver.resolveDeclarations(declarations, envFile);

    // Only {{PROJ}} is resolved; ${home} is left for platform resolver
    const result = resolver.interpolateForExecution(
      { path: '${home}/projects/{{PROJ}}/README.md' },
      resolved,
    );

    expect(result.path).to.equal('${home}/projects/myapp/README.md');
  });
});
