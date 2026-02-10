/**
 * Slide parser for extracting individual slides from deck content
 * Splits content on `---` delimiter (horizontal rule)
 */

import matter from 'gray-matter';
import MarkdownIt from 'markdown-it';
import { Slide, SlideFrontmatter, createSlide } from '../models/slide';
import { parseActionLinks } from './actionLinkParser';
import { parseActionBlocks } from './actionBlockParser';
import { parseRenderDirectives } from '../renderer';
import { injectBlockElementsFromParsed } from '../renderer/blockElementRenderer';
import { processFragments } from './fragmentProcessor';

// Initialize markdown-it renderer
const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
});

/**
 * Slide delimiter pattern: --- on its own line
 * Must be at least 3 dashes with optional whitespace
 */
const SLIDE_DELIMITER = /^---+\s*$/m;

/**
 * Accumulated parse warnings from the last parseSlides() call.
 * Reset at the start of each parseSlides() invocation.
 */
let _lastParseWarnings: string[] = [];

/**
 * Get warnings from the most recent parseSlides() call.
 * Returns action block parse errors formatted as human-readable strings.
 */
export function getLastParseWarnings(): string[] {
  return _lastParseWarnings;
}

/**
 * Parse content into individual slides
 */
export function parseSlides(content: string): Slide[] {
  // Reset warnings
  _lastParseWarnings = [];
  
  // Split content on slide delimiter
  const rawSlides = splitOnDelimiter(content);
  
  const slides: Slide[] = [];
  
  for (let index = 0; index < rawSlides.length; index++) {
    const rawContent = rawSlides[index].trim();
    
    // Skip empty slides (but keep first slide even if empty)
    if (!rawContent && index > 0) {
      continue;
    }
    
    const slide = parseSlideContent(index, rawContent);
    // Re-index after filtering
    slide.index = slides.length;
    slides.push(slide);
  }
  
  return slides;
}

/**
 * Split content on --- delimiter
 * Handles edge cases like leading/trailing delimiters
 */
function splitOnDelimiter(content: string): string[] {
  // Split on delimiter lines
  const parts = content.split(SLIDE_DELIMITER);
  
  // Filter out completely empty parts but preserve whitespace-only for processing
  return parts.filter((part, index) => {
    // Always keep first part
    if (index === 0) {
      return true;
    }
    // Keep non-empty parts
    return part.trim().length > 0;
  });
}

/**
 * Parse individual slide content including frontmatter
 */
function parseSlideContent(index: number, rawContent: string): Slide {
  let content = rawContent;
  let frontmatter: SlideFrontmatter | undefined;
  
  // Step 1: Check if slide starts with frontmatter (---)
  if (rawContent.startsWith('---')) {
    try {
      const parsed = matter(rawContent);
      frontmatter = parsed.data as SlideFrontmatter;
      content = parsed.content.trim();
    } catch {
      // If frontmatter parsing fails, use raw content
      content = rawContent;
    }
  }
  
  // Step 2: Parse action blocks (NEW — extracts elements + cleans content)
  const actionBlockResult = parseActionBlocks(content, index);
  const cleanedContent = actionBlockResult.cleanedContent;
  
  // Accumulate action block parse errors as warnings (non-fatal)
  for (const err of actionBlockResult.errors) {
    _lastParseWarnings.push(
      `Slide ${index + 1}, line ${err.line}: ${err.message}`
    );
  }
  
  // Step 3: Render markdown to HTML (uses cleaned content — no action blocks in output)
  let html = md.render(cleanedContent);
  
  // Step 4: Inject block element buttons into HTML (replaces <!--ACTION:--> placeholders)
  // This must happen BEFORE fragment processing so that action buttons with
  // `fragment: true` get fragment indices in document order alongside other
  // fragment-marked elements.
  html = injectBlockElementsFromParsed(html, actionBlockResult.elements);
  
  // Step 5: Process fragments and get count
  const { html: fragmentHtml, fragmentCount } = processFragments(html);
  html = fragmentHtml;
  
  // Create base slide
  const slide = createSlide(index, content, html, frontmatter);
  slide.fragmentCount = fragmentCount;
  
  // Step 6: Parse interactive action links from original content (inline links still parsed)
  const inlineElements = parseActionLinks(content, index);
  
  // Step 7: Merge block elements and inline elements into interactiveElements
  slide.interactiveElements = [...actionBlockResult.elements, ...inlineElements];
  
  // Parse render directives from content
  const directives = parseRenderDirectives(content, index);
  slide.renderDirectives = directives.map(d => ({
    id: d.id,
    type: d.type,
    rawDirective: d.rawDirective,
    position: d.position,
  }));
  
  return slide;
}

/**
 * Render markdown content to HTML
 */
export function renderMarkdown(content: string): string {
  return md.render(content);
}
