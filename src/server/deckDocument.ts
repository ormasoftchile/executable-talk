/**
 * DeckDocument model for the LSP server.
 * Maintains a parsed representation of a .deck.md file with position tracking.
 * All positions use 0-based LSP coordinates (line, character).
 *
 * Per data-model.md and contracts/document-model.md.
 */

import { Range, Position } from 'vscode-languageserver-types';
import { parseYaml, extractParameterRanges, YamlParseError } from './utils/yamlParser';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface ParameterRange {
    key: string;
    value: unknown;
    keyRange: Range;
    valueRange: Range;
    lineRange: Range;
}

export interface StepRange {
    index: number;
    range: Range;
    actionType: string | undefined;
    typeRange: Range | undefined;
    parameters: ParameterRange[];
}

export interface ActionBlockRange {
    range: Range;
    contentRange: Range;
    yamlContent: string;
    parsedYaml: Record<string, unknown> | undefined;
    parseError: YamlParseError | undefined;
    actionType: string | undefined;
    typeRange: Range | undefined;
    parameters: ParameterRange[];
    steps: StepRange[];
    unclosed: boolean;
}

export interface ActionLinkRange {
    range: Range;
    label: string;
    typeRange: Range;
    type: string;
    params: Map<string, { value: string; range: Range }>;
}

export interface RenderDirectiveRange {
    range: Range;
    label: string;
    typeRange: Range;
    type: string;
    params: Map<string, { value: string; range: Range }>;
}

export interface SlideRange {
    index: number;
    range: Range;
    title: string | undefined;
    frontmatterRange: Range | undefined;
    actionBlocks: ActionBlockRange[];
    actionLinks: ActionLinkRange[];
    renderDirectives: RenderDirectiveRange[];
}

export interface DeckDocumentData {
    uri: string;
    version: number;
    content: string;
    slides: SlideRange[];
    frontmatterRange: Range | undefined;
}

// ─── Regular Expressions ─────────────────────────────────────────────────────

const SLIDE_DELIMITER = /^---+\s*$/;
const ACTION_FENCE_OPEN = /^```action\s*$/;
const FENCE_CLOSE = /^```\s*$/;
const ACTION_LINK_PATTERN = /\[([^\]]+)\]\(action:([a-z.]+)(?:\?([^)]*))?\)/g;
const RENDER_DIRECTIVE_PATTERN = /\[([^\]]*)\]\(render:(file|command|diff)(?:\?([^)]*))?\)/g;

// ─── DeckDocument ────────────────────────────────────────────────────────────

export class DeckDocument {
    readonly uri: string;
    readonly version: number;
    readonly content: string;
    readonly slides: SlideRange[];
    readonly frontmatterRange: Range | undefined;

    private constructor(data: DeckDocumentData) {
        this.uri = data.uri;
        this.version = data.version;
        this.content = data.content;
        this.slides = data.slides;
        this.frontmatterRange = data.frontmatterRange;
    }

    /**
     * Create a new DeckDocument from raw content.
     */
    static create(uri: string, version: number, content: string): DeckDocument {
        const lines = content.split('\n');
        const frontmatterRange = DeckDocument.detectFrontmatter(lines);
        const slideBoundaries = DeckDocument.findSlideBoundaries(lines, frontmatterRange);
        const slides = DeckDocument.buildSlides(lines, slideBoundaries, frontmatterRange);

        return new DeckDocument({
            uri,
            version,
            content,
            slides,
            frontmatterRange,
        });
    }

    /**
     * Apply incremental changes and return a new DeckDocument.
     * For simplicity (and correctness), performs a full re-parse.
     * Incremental optimization can be added later for large documents.
     */
    static applyChange(
        prev: DeckDocument,
        version: number,
        newContent: string,
    ): DeckDocument {
        return DeckDocument.create(prev.uri, version, newContent);
    }

    /**
     * Get the lines array from content.
     */
    getLines(): string[] {
        return this.content.split('\n');
    }

    /**
     * Get a specific line of the document.
     */
    getLine(line: number): string {
        const lines = this.getLines();
        return line >= 0 && line < lines.length ? lines[line] : '';
    }

    /**
     * Get total line count.
     */
    get lineCount(): number {
        return this.content.split('\n').length;
    }

    /**
     * Find the slide containing a given position.
     */
    findSlideAt(position: Position): SlideRange | undefined {
        return this.slides.find(s => containsPosition(s.range, position));
    }

    /**
     * Find the action block containing a given position.
     */
    findActionBlockAt(position: Position): ActionBlockRange | undefined {
        for (const slide of this.slides) {
            for (const block of slide.actionBlocks) {
                if (containsPosition(block.contentRange, position)) {
                    return block;
                }
            }
        }
        return undefined;
    }

    // ─── Static Parsing Methods ──────────────────────────────────────────────

    /**
     * Detect YAML frontmatter at the beginning of the document.
     * Frontmatter: first line is `---`, closed by another `---`.
     */
    static detectFrontmatter(lines: string[]): Range | undefined {
        if (lines.length < 2 || !SLIDE_DELIMITER.test(lines[0])) {
            return undefined;
        }
        for (let i = 1; i < lines.length; i++) {
            if (SLIDE_DELIMITER.test(lines[i])) {
                return Range.create(0, 0, i, lines[i].length);
            }
        }
        return undefined;
    }

    /**
     * Find slide boundary line numbers.
     * Returns line numbers of `---` delimiters that act as slide separators.
     * Excludes frontmatter boundaries and delimiters inside code fences.
     */
    static findSlideBoundaries(lines: string[], frontmatterRange: Range | undefined): number[] {
        const boundaries: number[] = [];
        let insideFence = false;
        const startLine = frontmatterRange ? frontmatterRange.end.line + 1 : 0;

        for (let i = startLine; i < lines.length; i++) {
            const line = lines[i];

            // Track code fence state (any ```-prefixed line)
            if (/^```/.test(line)) {
                insideFence = !insideFence;
                continue;
            }

            if (!insideFence && SLIDE_DELIMITER.test(line)) {
                boundaries.push(i);
            }
        }

        return boundaries;
    }

    /**
     * Build slide ranges from boundary lines.
     */
    static buildSlides(
        lines: string[],
        boundaries: number[],
        frontmatterRange: Range | undefined,
    ): SlideRange[] {
        const slides: SlideRange[] = [];
        const contentStart = frontmatterRange ? frontmatterRange.end.line + 1 : 0;
        const allBoundaries = [...boundaries];
        const slideStarts: number[] = [contentStart];

        for (const b of allBoundaries) {
            slideStarts.push(b + 1);
        }

        for (let i = 0; i < slideStarts.length; i++) {
            const start = slideStarts[i];
            const end = i < allBoundaries.length
                ? allBoundaries[i] - 1
                : lines.length - 1;

            if (start > lines.length - 1) {
                continue;
            }

            const slideLines = lines.slice(start, end + 1);
            const slideContent = slideLines.join('\n');

            // Detect slide-level frontmatter (rare but possible)
            const title = DeckDocument.extractSlideTitle(slideLines);

            // Parse action blocks
            const actionBlocks = DeckDocument.parseActionBlocks(lines, start, end);

            // Parse inline action links
            const actionLinks = DeckDocument.parseActionLinks(slideContent, start);

            // Parse render directives
            const renderDirectives = DeckDocument.parseRenderDirectives(slideContent, start);

            slides.push({
                index: slides.length,
                range: Range.create(start, 0, end, lines[Math.min(end, lines.length - 1)].length),
                title,
                frontmatterRange: undefined,
                actionBlocks,
                actionLinks,
                renderDirectives,
            });
        }

        // Ensure at least one slide
        if (slides.length === 0) {
            slides.push({
                index: 0,
                range: Range.create(0, 0, Math.max(0, lines.length - 1), lines[lines.length - 1]?.length ?? 0),
                title: undefined,
                frontmatterRange: undefined,
                actionBlocks: [],
                actionLinks: [],
                renderDirectives: [],
            });
        }

        return slides;
    }

    /**
     * Extract a title from slide content (first heading or undefined).
     */
    static extractSlideTitle(slideLines: string[]): string | undefined {
        for (const line of slideLines) {
            const match = line.match(/^#+\s+(.+)/);
            if (match) {
                return match[1].trim();
            }
        }
        return undefined;
    }

    /**
     * Parse action blocks within a line range of the document.
     */
    static parseActionBlocks(lines: string[], startLine: number, endLine: number): ActionBlockRange[] {
        const blocks: ActionBlockRange[] = [];
        let insideBlock = false;
        let blockStartLine = -1;
        let contentLines: string[] = [];

        for (let i = startLine; i <= endLine; i++) {
            const line = lines[i];

            if (!insideBlock) {
                if (ACTION_FENCE_OPEN.test(line)) {
                    insideBlock = true;
                    blockStartLine = i;
                    contentLines = [];
                }
            } else {
                if (FENCE_CLOSE.test(line)) {
                    const block = DeckDocument.buildActionBlock(
                        blockStartLine, i, contentLines, false,
                    );
                    blocks.push(block);
                    insideBlock = false;
                    blockStartLine = -1;
                    contentLines = [];
                } else {
                    contentLines.push(line);
                }
            }
        }

        // Handle unclosed block
        if (insideBlock) {
            const block = DeckDocument.buildActionBlock(
                blockStartLine, endLine, contentLines, true,
            );
            blocks.push(block);
        }

        return blocks;
    }

    /**
     * Build a single ActionBlockRange from parsed fence boundaries.
     */
    private static buildActionBlock(
        startLine: number,
        endLine: number,
        contentLines: string[],
        unclosed: boolean,
    ): ActionBlockRange {
        const yamlContent = contentLines.join('\n');
        const contentStartLine = startLine + 1;

        // Parse YAML
        const yamlResult = parseYaml(yamlContent, contentStartLine);
        const parsedYaml = yamlResult.value;
        const parseError = yamlResult.error;

        // Extract action type
        let actionType: string | undefined;
        let typeRange: Range | undefined;
        if (parsedYaml && typeof parsedYaml.type === 'string') {
            actionType = parsedYaml.type;
            // Find the type line
            for (let i = 0; i < contentLines.length; i++) {
                const match = contentLines[i].match(/^type:\s*(.+)/);
                if (match) {
                    const valueStart = contentLines[i].indexOf(match[1]);
                    typeRange = Range.create(
                        contentStartLine + i, valueStart,
                        contentStartLine + i, valueStart + match[1].trimEnd().length,
                    );
                    break;
                }
            }
        }

        // Extract parameters
        let parameters: ParameterRange[] = [];
        if (parsedYaml) {
            const paramInfos = extractParameterRanges(yamlContent, parsedYaml, contentStartLine);
            parameters = paramInfos.map(p => ({
                key: p.key,
                value: p.value,
                keyRange: p.keyRange,
                valueRange: p.valueRange,
                lineRange: p.lineRange,
            }));
        }

        // Parse steps for sequence type
        let steps: StepRange[] = [];
        if (parsedYaml && actionType === 'sequence' && Array.isArray(parsedYaml.steps)) {
            steps = DeckDocument.parseSteps(contentLines, contentStartLine, parsedYaml.steps);
        }

        const contentEndLine = contentLines.length > 0
            ? contentStartLine + contentLines.length - 1
            : contentStartLine;
        const lastContentLine = contentLines.length > 0
            ? contentLines[contentLines.length - 1]
            : '';

        return {
            range: Range.create(startLine, 0, endLine, unclosed ? 0 : 3),
            contentRange: Range.create(
                contentStartLine, 0,
                contentEndLine, lastContentLine.length,
            ),
            yamlContent,
            parsedYaml,
            parseError,
            actionType,
            typeRange,
            parameters,
            steps,
            unclosed,
        };
    }

    /**
     * Parse steps from a sequence action block.
     */
    private static parseSteps(
        contentLines: string[],
        contentStartLine: number,
        stepsArray: unknown[],
    ): StepRange[] {
        const steps: StepRange[] = [];
        let currentStepStart = -1;
        let stepIndex = 0;

        // Find step boundaries by looking for `- type:` patterns
        for (let i = 0; i < contentLines.length; i++) {
            const line = contentLines[i];
            const stepMatch = line.match(/^(\s*)-\s+type:\s*(.*)/);
            if (stepMatch) {
                // Close previous step
                if (currentStepStart >= 0 && stepIndex <= stepsArray.length) {
                    const prevStep = stepsArray[stepIndex - 1];
                    steps.push(DeckDocument.buildStepRange(
                        stepIndex - 1, contentStartLine + currentStepStart,
                        contentStartLine + i - 1, contentLines,
                        currentStepStart, i - 1,
                        typeof prevStep === 'object' && prevStep !== null ? prevStep as Record<string, unknown> : undefined,
                    ));
                }
                currentStepStart = i;
                stepIndex++;
            }
        }

        // Close last step
        if (currentStepStart >= 0 && stepIndex <= stepsArray.length) {
            const lastStep = stepsArray[stepIndex - 1];
            steps.push(DeckDocument.buildStepRange(
                stepIndex - 1, contentStartLine + currentStepStart,
                contentStartLine + contentLines.length - 1, contentLines,
                currentStepStart, contentLines.length - 1,
                typeof lastStep === 'object' && lastStep !== null ? lastStep as Record<string, unknown> : undefined,
            ));
        }

        return steps;
    }

    private static buildStepRange(
        index: number,
        docStartLine: number,
        docEndLine: number,
        contentLines: string[],
        localStart: number,
        localEnd: number,
        stepObj: Record<string, unknown> | undefined,
    ): StepRange {
        let actionType: string | undefined;
        let typeRange: Range | undefined;
        const parameters: ParameterRange[] = [];

        if (stepObj) {
            if (typeof stepObj.type === 'string') {
                actionType = stepObj.type;
            }

            // Find ranges within step lines
            for (let i = localStart; i <= localEnd && i < contentLines.length; i++) {
                const line = contentLines[i];
                const typeMatch = line.match(/(?:^-\s+|\s+)type:\s*(.*)/);
                if (typeMatch && !typeRange) {
                    const valueStart = line.indexOf(typeMatch[1]);
                    if (valueStart >= 0) {
                        typeRange = Range.create(
                            docStartLine + (i - localStart), valueStart,
                            docStartLine + (i - localStart), valueStart + typeMatch[1].trimEnd().length,
                        );
                    }
                }

                // Match parameter lines within the step (indented)
                const paramMatch = line.match(/^\s{2,}(\w+):\s*(.*)/);
                if (paramMatch && paramMatch[1] !== 'type') {
                    const key = paramMatch[1];
                    const valText = paramMatch[2];
                    const keyStart = line.indexOf(key);
                    const docLine = docStartLine + (i - localStart);

                    if (key in stepObj) {
                        const colonPos = line.indexOf(':', keyStart + key.length);
                        const valStart = colonPos + 1 + (line.slice(colonPos + 1).length - line.slice(colonPos + 1).trimStart().length);

                        parameters.push({
                            key,
                            value: stepObj[key],
                            keyRange: Range.create(docLine, keyStart, docLine, keyStart + key.length),
                            valueRange: Range.create(docLine, valStart, docLine, valStart + valText.trimEnd().length),
                            lineRange: Range.create(docLine, 0, docLine, line.length),
                        });
                    }
                }
            }
        }

        const endLineText = localEnd < contentLines.length ? contentLines[localEnd] : '';
        return {
            index,
            range: Range.create(docStartLine, 0, docEndLine, endLineText.length),
            actionType,
            typeRange,
            parameters,
        };
    }

    /**
     * Parse inline action links from slide content.
     */
    static parseActionLinks(slideContent: string, slideStartLine: number): ActionLinkRange[] {
        const links: ActionLinkRange[] = [];
        const contentLines = slideContent.split('\n');

        for (let lineIdx = 0; lineIdx < contentLines.length; lineIdx++) {
            const line = contentLines[lineIdx];
            const regex = new RegExp(ACTION_LINK_PATTERN.source, 'g');
            let match: RegExpExecArray | null;

            while ((match = regex.exec(line)) !== null) {
                const fullMatch = match[0];
                const label = match[1];
                const type = match[2];
                const queryString = match[3] || '';

                const startChar = match.index;
                const endChar = startChar + fullMatch.length;
                const docLine = slideStartLine + lineIdx;

                // Find type position within the link
                const actionIdx = fullMatch.indexOf('action:') + 'action:'.length;
                const typeEndIdx = type.length;
                const typeStartChar = startChar + actionIdx;
                const typeEndChar = typeStartChar + typeEndIdx;

                const params = new Map<string, { value: string; range: Range }>();
                if (queryString) {
                    const queryStart = fullMatch.indexOf('?') + 1;
                    let offset = startChar + queryStart;
                    for (const pair of queryString.split('&')) {
                        const eqIdx = pair.indexOf('=');
                        if (eqIdx > 0) {
                            const key = pair.substring(0, eqIdx);
                            const value = pair.substring(eqIdx + 1);
                            const valueOffset = offset + eqIdx + 1;
                            params.set(key, {
                                value: decodeURIComponent(value),
                                range: Range.create(docLine, valueOffset, docLine, valueOffset + value.length),
                            });
                        }
                        offset += pair.length + 1; // +1 for '&'
                    }
                }

                links.push({
                    range: Range.create(docLine, startChar, docLine, endChar),
                    label,
                    typeRange: Range.create(docLine, typeStartChar, docLine, typeEndChar),
                    type,
                    params,
                });
            }
        }

        return links;
    }

    /**
     * Parse render directives from slide content.
     */
    static parseRenderDirectives(slideContent: string, slideStartLine: number): RenderDirectiveRange[] {
        const directives: RenderDirectiveRange[] = [];
        const contentLines = slideContent.split('\n');

        for (let lineIdx = 0; lineIdx < contentLines.length; lineIdx++) {
            const line = contentLines[lineIdx];
            const regex = new RegExp(RENDER_DIRECTIVE_PATTERN.source, 'g');
            let match: RegExpExecArray | null;

            while ((match = regex.exec(line)) !== null) {
                const fullMatch = match[0];
                const label = match[1];
                const type = match[2];
                const queryString = match[3] || '';

                const startChar = match.index;
                const endChar = startChar + fullMatch.length;
                const docLine = slideStartLine + lineIdx;

                const renderIdx = fullMatch.indexOf('render:') + 'render:'.length;
                const typeStartChar = startChar + renderIdx;
                const typeEndChar = typeStartChar + type.length;

                const params = new Map<string, { value: string; range: Range }>();
                if (queryString) {
                    const queryStart = fullMatch.indexOf('?') + 1;
                    let offset = startChar + queryStart;
                    for (const pair of queryString.split('&')) {
                        const eqIdx = pair.indexOf('=');
                        if (eqIdx > 0) {
                            const key = pair.substring(0, eqIdx);
                            const value = pair.substring(eqIdx + 1);
                            const valueOffset = offset + eqIdx + 1;
                            params.set(key, {
                                value: decodeURIComponent(value),
                                range: Range.create(docLine, valueOffset, docLine, valueOffset + value.length),
                            });
                        }
                        offset += pair.length + 1;
                    }
                }

                directives.push({
                    range: Range.create(docLine, startChar, docLine, endChar),
                    label,
                    typeRange: Range.create(docLine, typeStartChar, docLine, typeEndChar),
                    type,
                    params,
                });
            }
        }

        return directives;
    }
}

// ─── Utility Functions ───────────────────────────────────────────────────────

/**
 * Check if a position is within a range (inclusive start, exclusive end).
 */
export function containsPosition(range: Range, position: Position): boolean {
    if (position.line < range.start.line || position.line > range.end.line) {
        return false;
    }
    if (position.line === range.start.line && position.character < range.start.character) {
        return false;
    }
    if (position.line === range.end.line && position.character > range.end.character) {
        return false;
    }
    return true;
}
