/**
 * YAML parser wrapper with range-preserving error reporting.
 * Wraps js-yaml to extract precise error positions from YAMLException marks.
 * Per data-model.md YamlParseError and contracts/document-model.md.
 */

import * as jsYaml from 'js-yaml';
import { Range } from 'vscode-languageserver-types';

/**
 * Structured YAML parse error with precise range in the document.
 */
export interface YamlParseError {
    /** Human-readable error message */
    message: string;
    /** Range in the document where the error occurred */
    range: Range;
    /** The js-yaml error mark, if available */
    mark: { line: number; column: number } | undefined;
}

/**
 * Result of parsing YAML content from an action block.
 */
export interface YamlParseResult {
    /** Parsed YAML object (undefined if parse failed) */
    value: Record<string, unknown> | undefined;
    /** Parse error with precise range (undefined if parse succeeded) */
    error: YamlParseError | undefined;
}

/**
 * Parse YAML content from an action block with range-preserving error reporting.
 *
 * @param yamlContent - Raw YAML text between action block fences
 * @param contentStartLine - 0-based document line of the first content line
 * @param contentStartChar - 0-based character offset of the content start (usually 0)
 * @returns Parsed result with value or structured error
 */
export function parseYaml(
    yamlContent: string,
    contentStartLine: number,
    contentStartChar: number = 0,
): YamlParseResult {
    try {
        const result = jsYaml.load(yamlContent);
        if (result === null || result === undefined) {
            return { value: undefined, error: undefined };
        }
        if (typeof result !== 'object' || Array.isArray(result)) {
            return {
                value: undefined,
                error: {
                    message: 'Action block content must be a YAML mapping (key: value pairs)',
                    range: Range.create(
                        contentStartLine, contentStartChar,
                        contentStartLine, contentStartChar + yamlContent.split('\n')[0].length,
                    ),
                    mark: undefined,
                },
            };
        }
        return { value: result as Record<string, unknown>, error: undefined };
    } catch (e: unknown) {
        if (isYamlException(e)) {
            const mark = e.mark;
            const errorLine = contentStartLine + (mark?.line ?? 0);
            const errorChar = contentStartChar + (mark?.column ?? 0);
            // Get the length of the line where the error occurred
            const lines = yamlContent.split('\n');
            const targetLine = mark?.line ?? 0;
            const lineLength = targetLine < lines.length ? lines[targetLine].length : 0;

            return {
                value: undefined,
                error: {
                    message: cleanYamlErrorMessage(e.message),
                    range: Range.create(
                        errorLine, errorChar,
                        errorLine, contentStartChar + lineLength,
                    ),
                    mark: mark ? { line: mark.line, column: mark.column } : undefined,
                },
            };
        }
        // Unknown error
        return {
            value: undefined,
            error: {
                message: e instanceof Error ? e.message : 'Unknown YAML parse error',
                range: Range.create(
                    contentStartLine, contentStartChar,
                    contentStartLine, contentStartChar + yamlContent.split('\n')[0].length,
                ),
                mark: undefined,
            },
        };
    }
}

/**
 * Type guard for js-yaml YAMLException.
 */
function isYamlException(e: unknown): e is { message: string; mark?: { line: number; column: number; position: number } } {
    return (
        e !== null &&
        typeof e === 'object' &&
        'message' in e &&
        typeof (e as Record<string, unknown>).message === 'string'
    );
}

/**
 * Clean up js-yaml error messages to be user-friendly.
 * Removes the "at line N, column M:" suffix that js-yaml appends.
 */
function cleanYamlErrorMessage(message: string): string {
    // js-yaml messages look like: "bad indentation of a mapping entry at line 3, column 5:\n    key: value\n    ^"
    const atLineMatch = message.match(/^(.+?)(?:\s+at line \d+)/);
    if (atLineMatch) {
        return atLineMatch[1].trim();
    }
    // Also strip trailing context lines
    const firstLine = message.split('\n')[0];
    return firstLine.trim();
}

/**
 * Compute key-value ranges from parsed YAML content.
 * Returns the position of each top-level key and value in the YAML text.
 *
 * @param yamlContent - Raw YAML text
 * @param contentStartLine - 0-based document line of the first content line
 * @returns Array of { key, value, keyRange, valueRange, lineRange } for each top-level pair
 */
export interface ParameterRangeInfo {
    key: string;
    value: unknown;
    keyRange: Range;
    valueRange: Range;
    lineRange: Range;
}

export function extractParameterRanges(
    yamlContent: string,
    parsedYaml: Record<string, unknown>,
    contentStartLine: number,
): ParameterRangeInfo[] {
    const results: ParameterRangeInfo[] = [];
    const lines = yamlContent.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Match top-level YAML keys (no leading whitespace, or consistent indent for list items)
        const keyMatch = line.match(/^(\s*-?\s*)(\w[\w.]*)\s*:\s*(.*)/);
        if (!keyMatch) {
            continue;
        }
        const indent = keyMatch[1];
        // Only process top-level keys (no indent or list-item indent)
        if (indent.length > 0 && !indent.startsWith('-')) {
            continue;
        }

        const key = keyMatch[2];
        const docLine = contentStartLine + i;

        if (!(key in parsedYaml)) {
            continue;
        }

        const keyStart = line.indexOf(key);
        const keyEnd = keyStart + key.length;

        const colonPos = line.indexOf(':', keyEnd);

        results.push({
            key,
            value: parsedYaml[key],
            keyRange: Range.create(docLine, keyStart, docLine, keyEnd),
            valueRange: Range.create(
                docLine,
                colonPos + 1 + (line.slice(colonPos + 1).length - line.slice(colonPos + 1).trimStart().length),
                docLine,
                line.trimEnd().length,
            ),
            lineRange: Range.create(docLine, 0, docLine, line.length),
        });
    }

    return results;
}
