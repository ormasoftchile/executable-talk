/**
 * Multi-document cache manager for the LSP server.
 * Maintains one DeckDocument per open file and manages lifecycle events.
 * Per contracts/document-model.md DeckDocumentManager contract.
 */

import { TextDocumentContentChangeEvent } from 'vscode-languageserver';
import { DeckDocument } from './deckDocument';

export class DeckDocumentManager {
    private readonly _documents = new Map<string, DeckDocument>();

    /**
     * Open a document and create its DeckDocument representation.
     */
    open(uri: string, version: number, content: string): DeckDocument {
        const doc = DeckDocument.create(uri, version, content);
        this._documents.set(uri, doc);
        return doc;
    }

    /**
     * Apply incremental changes to an open document.
     * Returns the updated DeckDocument.
     */
    update(
        uri: string,
        version: number,
        _changes: TextDocumentContentChangeEvent[],
        fullContent: string,
    ): DeckDocument | undefined {
        const existing = this._documents.get(uri);
        if (!existing) {
            return undefined;
        }
        const updated = DeckDocument.applyChange(existing, version, fullContent);
        this._documents.set(uri, updated);
        return updated;
    }

    /**
     * Close a document and remove it from the cache.
     */
    close(uri: string): void {
        this._documents.delete(uri);
    }

    /**
     * Get a cached document by URI.
     */
    get(uri: string): DeckDocument | undefined {
        return this._documents.get(uri);
    }

    /**
     * Check if a document is open.
     */
    has(uri: string): boolean {
        return this._documents.has(uri);
    }

    /**
     * Get all open document URIs.
     */
    keys(): IterableIterator<string> {
        return this._documents.keys();
    }

    /**
     * Dispose all documents.
     */
    dispose(): void {
        this._documents.clear();
    }
}
