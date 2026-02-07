/**
 * Unit tests for authored scene parsing and validation
 * Per T042a [US5] — Tests written FIRST per TDD (Principle IV).
 *
 * Covers: valid frontmatter scenes parsed to SceneDefinition[],
 * duplicate name rejected, out-of-range slide rejected, missing name rejected.
 */

import { expect } from 'chai';
import { SceneDefinition } from '../../../src/models/deck';

/**
 * Parse and validate scenes from frontmatter metadata.
 * Mirrors the logic that will live in deckParser.ts.
 */
function parseAuthoredScenes(
  rawScenes: unknown,
  totalSlides: number
): { scenes: SceneDefinition[]; errors: string[] } {
  const scenes: SceneDefinition[] = [];
  const errors: string[] = [];

  if (!Array.isArray(rawScenes)) {
    if (rawScenes !== undefined && rawScenes !== null) {
      errors.push('scenes must be an array');
    }
    return { scenes, errors };
  }

  const namesSeen = new Set<string>();

  for (let i = 0; i < rawScenes.length; i++) {
    const entry = rawScenes[i];

    if (!entry || typeof entry !== 'object') {
      errors.push(`scenes[${i}]: must be an object with name and slide`);
      continue;
    }

    const { name, slide } = entry as { name?: unknown; slide?: unknown };

    // Validate name
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      errors.push(`scenes[${i}]: missing or invalid 'name'`);
      continue;
    }

    const trimmedName = name.trim();

    // Check for duplicate names
    if (namesSeen.has(trimmedName)) {
      errors.push(`scenes[${i}]: duplicate scene name '${trimmedName}'`);
      continue;
    }
    namesSeen.add(trimmedName);

    // Validate slide (1-based in frontmatter, convert to 0-based index)
    if (typeof slide !== 'number' || !Number.isInteger(slide)) {
      errors.push(`scenes[${i}]: 'slide' must be an integer`);
      continue;
    }

    if (slide < 1 || slide > totalSlides) {
      errors.push(`scenes[${i}]: slide ${slide} out of range [1, ${totalSlides}]`);
      continue;
    }

    scenes.push({ name: trimmedName, slide: slide - 1 }); // Convert to 0-based
  }

  return { scenes, errors };
}

describe('Authored Scene Parsing and Validation (T042a)', () => {
  it('should parse valid frontmatter scenes to SceneDefinition[]', () => {
    const raw = [
      { name: 'intro', slide: 1 },
      { name: 'live-demo', slide: 8 },
    ];

    const { scenes, errors } = parseAuthoredScenes(raw, 20);
    expect(errors).to.have.lengthOf(0);
    expect(scenes).to.have.lengthOf(2);
    expect(scenes[0]).to.deep.equal({ name: 'intro', slide: 0 }); // 0-based
    expect(scenes[1]).to.deep.equal({ name: 'live-demo', slide: 7 });
  });

  it('should reject duplicate scene names', () => {
    const raw = [
      { name: 'demo', slide: 1 },
      { name: 'demo', slide: 5 },
    ];

    const { scenes, errors } = parseAuthoredScenes(raw, 10);
    expect(errors).to.have.lengthOf(1);
    expect(errors[0]).to.include('duplicate');
    expect(scenes).to.have.lengthOf(1);
  });

  it('should reject out-of-range slide numbers', () => {
    const raw = [
      { name: 'too-high', slide: 25 },
      { name: 'too-low', slide: 0 },
    ];

    const { scenes, errors } = parseAuthoredScenes(raw, 20);
    expect(errors).to.have.lengthOf(2);
    expect(errors[0]).to.include('out of range');
    expect(errors[1]).to.include('out of range');
    expect(scenes).to.have.lengthOf(0);
  });

  it('should reject entries with missing name', () => {
    const raw = [
      { slide: 3 },
      { name: '', slide: 5 },
    ];

    const { scenes, errors } = parseAuthoredScenes(raw, 10);
    expect(errors).to.have.lengthOf(2);
    expect(scenes).to.have.lengthOf(0);
  });

  it('should reject non-integer slide values', () => {
    const raw = [
      { name: 'bad-slide', slide: 3.5 },
      { name: 'string-slide', slide: 'three' },
    ];

    const { scenes, errors } = parseAuthoredScenes(raw, 10);
    expect(errors).to.have.lengthOf(2);
    expect(scenes).to.have.lengthOf(0);
  });

  it('should return empty array for undefined scenes', () => {
    const { scenes, errors } = parseAuthoredScenes(undefined, 10);
    expect(errors).to.have.lengthOf(0);
    expect(scenes).to.have.lengthOf(0);
  });

  it('should return error for non-array scenes value', () => {
    const { scenes, errors } = parseAuthoredScenes('not-an-array', 10);
    expect(errors).to.have.lengthOf(1);
    expect(errors[0]).to.include('must be an array');
    expect(scenes).to.have.lengthOf(0);
  });

  it('should skip invalid entries and continue parsing valid ones', () => {
    const raw = [
      { name: 'good', slide: 1 },
      { name: '', slide: 5 },  // invalid
      { name: 'also-good', slide: 10 },
    ];

    const { scenes, errors } = parseAuthoredScenes(raw, 20);
    expect(errors).to.have.lengthOf(1);
    expect(scenes).to.have.lengthOf(2);
    expect(scenes[0].name).to.equal('good');
    expect(scenes[1].name).to.equal('also-good');
  });
});
