/**
 * Merge engine — combines parsed Slide[] with a loaded SidecarFile into
 * enriched Slide[]. Pure function; no file I/O, no VS Code API calls.
 *
 * DA-05: Sidecar merge engine.
 *
 * Precedence: inline value (already on Slide) > sidecar value > global defaults.
 */

import type { Slide } from '../models/slide';
import type { DeckMetadata } from '../models/deck';
import type { SidecarFile, SidecarSlide } from '../models/sidecar';
import { mapSidecarActionsToInteractiveElements } from './sidecarActionMapper';

const LAYOUT_CLASS_MAP: Record<string, string> = {
  center: 'layout-center',
  columns: 'layout-columns',
  left: 'layout-left',
  right: 'layout-right',
  group: 'slide-group',
};

/**
 * Merge sidecar slide entries into a parsed Slide array.
 *
 * - Slides with no matching sidecar entry pass through unchanged.
 * - Sidecar entries with no matching slide ID are silently skipped.
 * - Returns a new array; input slides are not mutated.
 */
export function mergeSidecarIntoSlides(slides: Slide[], sidecar: SidecarFile): Slide[] {
  const entries = [...(sidecar.slides ?? []), ...(sidecar.items ?? [])];
  if (entries.length === 0) {
    return slides;
  }

  const sidecarMap = new Map<string, SidecarSlide>(
    entries.map(s => [s.id, s])
  );

  return slides.map(slide => {
    if (!slide.id) {
      return slide;
    }

    const sidecarSlide = sidecarMap.get(slide.id);
    if (!sidecarSlide) {
      return slide;
    }

    const merged: Slide = { ...slide };

    // cues: apply sidecar cues only when slide has none
    if (sidecarSlide.cues !== undefined && merged.cues === undefined) {
      merged.cues = sidecarSlide.cues;
    }

    // duration: apply sidecar value only when slide has none
    if (sidecarSlide.duration !== undefined && merged.duration === undefined) {
      merged.duration = sidecarSlide.duration;
    }

    // checkpoint: apply sidecar value only when slide has none
    if (sidecarSlide.checkpoint !== undefined && merged.checkpoint === undefined) {
      merged.checkpoint = sidecarSlide.checkpoint;
    }

    // notes: apply sidecar speaker notes only when slide has none
    if (sidecarSlide.notes !== undefined && merged.speakerNotes === undefined) {
      merged.speakerNotes = sidecarSlide.notes;
    }

    // layout: wrap the slide HTML in the appropriate layout div when specified
    // in the sidecar. Only applied when sidecar specifies it (inline-first: if
    // the markdown already wraps content in layout divs, this adds an outer wrapper).
    if (sidecarSlide.layout !== undefined) {
      const layoutClass = LAYOUT_CLASS_MAP[sidecarSlide.layout] ?? `layout-${sidecarSlide.layout}`;
      merged.html = `<div class="${layoutClass}">${merged.html}</div>`;
    }

    // autoFragment: when explicitly false, strip all fragment attributes from HTML
    if (sidecarSlide.autoFragment === false) {
      let h = merged.html;
      // Strip fragment class from elements that had ONLY "fragment" as their class
      h = h.replace(/\sclass="fragment"/g, '');
      // Strip fragment class from elements that had it appended to other classes
      h = h.replace(/(\sclass="[^"]*)\bfragment\b\s*/g, '$1');
      // Clean up trailing spaces in class attributes
      h = h.replace(/\sclass="\s+/g, ' class="');
      h = h.replace(/\s+"/g, '"');
      // Strip data-fragment attributes
      h = h.replace(/\s+data-fragment="\d+"/g, '');
      h = h.replace(/\s+data-fragment-animation="[\w-]+"/g, '');
      merged.html = h;
      merged.fragmentCount = 0;
    }

    // sidecarActions: store raw entries, then render as clickable interactive elements
    // (source='sidecar') appended after slide content. This ensures the presenter
    // controls when actions fire — never auto-executed on slide entry.
    if (sidecarSlide.actions !== undefined) {
      merged.sidecarActions = sidecarSlide.actions;

      const sidecarElements = mapSidecarActionsToInteractiveElements(sidecarSlide.actions, slide.index);
      if (sidecarElements.length > 0) {
        merged.interactiveElements = [...merged.interactiveElements, ...sidecarElements];
        // Each sidecar element with fragment=true will be injected as an additional
        // fragment step (after existing fragments). Update fragmentCount so the
        // Conductor knows the correct total number of reveal steps.
        const fragmentingCount = sidecarElements.filter(el => el.fragment !== false).length;
        if (fragmentingCount > 0) {
          merged.fragmentCount = slide.fragmentCount + fragmentingCount;
        }
      }
    }

    return merged;
  });
}

/**
 * Merge sidecar deck-level metadata into a DeckMetadata object.
 *
 * - Inline values already present on `metadata` take precedence.
 * - Returns a new object; input metadata is not mutated.
 */
export function mergeSidecarDeckMetadata(metadata: DeckMetadata, sidecar: SidecarFile): DeckMetadata {
  if (!sidecar.deck && !sidecar.recording && !sidecar.export) {
    return metadata;
  }

  const merged: DeckMetadata = { ...metadata };

  if (sidecar.deck) {
    if (sidecar.deck.appearance !== undefined) {
      merged.appearance = { ...sidecar.deck.appearance, ...(merged.appearance ?? {}) };
    }
    if (sidecar.deck.title !== undefined && merged.title === undefined) {
      merged.title = sidecar.deck.title;
    }

    if (sidecar.deck.theme !== undefined && merged.theme === undefined) {
      merged.theme = sidecar.deck.theme;
    }

    if (sidecar.deck.listFragmentMode !== undefined && merged.listFragmentMode === undefined) {
      merged.listFragmentMode = sidecar.deck.listFragmentMode;
    }

    if (sidecar.deck.slideBreak !== undefined && merged.slideBreak === undefined) {
      merged.slideBreak = sidecar.deck.slideBreak;
    }

    // diagrams: field-by-field merge — sidecar as base, inline wins per field
    if (sidecar.deck.diagrams !== undefined) {
      merged.diagrams = { ...sidecar.deck.diagrams, ...(merged.diagrams ?? {}) };
    }
  }

  // recording: field-by-field merge — sidecar as base, inline wins per field
  if (sidecar.recording !== undefined) {
    merged.recording = { ...sidecar.recording, ...(merged.recording ?? {}) };
  }

  // export: field-by-field merge — sidecar as base, inline wins per field
  if (sidecar.export !== undefined) {
    merged.export = { ...sidecar.export, ...(merged.export ?? {}) };
  }

  return merged;
}
