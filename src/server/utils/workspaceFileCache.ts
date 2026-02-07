/**
 * WorkspaceFileCache — cached workspace file listing for path completion and go-to-definition.
 * Per spec.md FR-045 (workspace file resolution) and FR-033 (definition handler).
 *
 * The cache is populated once on server startup and refreshed via workspace/didChangeWatchedFiles.
 * Supports:
 * - Prefix-filtered file path completion
 * - URI resolution for relative paths
 * - launch.json config name resolution
 */

import { Location, Range } from 'vscode-languageserver-types';

/**
 * Represents a cached workspace file entry.
 */
export interface CachedFile {
    /** Workspace-relative path (forward-slash separated) */
    relativePath: string;
    /** Full URI string */
    uri: string;
}

/**
 * Represents a cached launch configuration.
 */
export interface CachedLaunchConfig {
    /** Configuration name */
    name: string;
    /** URI of the launch.json file */
    uri: string;
    /** Line number where this config starts (0-based) */
    line: number;
}

/**
 * Workspace file cache for path completion and definition resolution.
 *
 * Usage:
 * 1. Create with `new WorkspaceFileCache(workspaceUri)`
 * 2. Populate with `setFiles(files)` / `setLaunchConfigs(configs)`
 * 3. Query with `filterByPrefix()`, `resolveUri()`, `resolveLaunchConfig()`
 * 4. Refresh on workspace/didChangeWatchedFiles notifications
 */
export class WorkspaceFileCache {
    private _workspaceUri: string;
    private _files: CachedFile[] = [];
    private _launchConfigs: CachedLaunchConfig[] = [];

    constructor(workspaceUri: string) {
        this._workspaceUri = workspaceUri.endsWith('/') ? workspaceUri : workspaceUri + '/';
    }

    get workspaceUri(): string {
        return this._workspaceUri;
    }

    // ─── File Operations ─────────────────────────────────────────────────────

    /**
     * Replace the entire file cache.
     */
    setFiles(files: CachedFile[]): void {
        this._files = files;
    }

    /**
     * Get all cached files.
     */
    getFiles(): ReadonlyArray<CachedFile> {
        return this._files;
    }

    /**
     * Filter files whose relative path starts with the given prefix (case-insensitive).
     */
    filterByPrefix(prefix: string): CachedFile[] {
        const lower = prefix.toLowerCase();
        return this._files.filter(f => f.relativePath.toLowerCase().startsWith(lower));
    }

    /**
     * Filter files whose relative path contains the given substring (case-insensitive).
     * Falls back from prefix match for fuzzy-like completions.
     */
    filterBySubstring(query: string): CachedFile[] {
        const lower = query.toLowerCase();
        return this._files.filter(f => f.relativePath.toLowerCase().includes(lower));
    }

    /**
     * Resolve a workspace-relative path to a full URI.
     * Returns null if no matching file is found.
     */
    resolveUri(relativePath: string): string | null {
        const normalized = relativePath.replace(/\\/g, '/');
        const file = this._files.find(f => f.relativePath === normalized);
        return file ? file.uri : null;
    }

    /**
     * Check if a workspace-relative path exists in the cache.
     */
    hasFile(relativePath: string): boolean {
        const normalized = relativePath.replace(/\\/g, '/');
        return this._files.some(f => f.relativePath === normalized);
    }

    /**
     * Add a single file to the cache (e.g., on file create event).
     */
    addFile(file: CachedFile): void {
        // Avoid duplicates
        if (!this._files.some(f => f.uri === file.uri)) {
            this._files.push(file);
        }
    }

    /**
     * Remove a file from the cache (e.g., on file delete event).
     */
    removeFile(uri: string): void {
        this._files = this._files.filter(f => f.uri !== uri);
    }

    // ─── Launch Config Operations ────────────────────────────────────────────

    /**
     * Replace the entire launch config cache.
     */
    setLaunchConfigs(configs: CachedLaunchConfig[]): void {
        this._launchConfigs = configs;
    }

    /**
     * Get all cached launch configs.
     */
    getLaunchConfigs(): ReadonlyArray<CachedLaunchConfig> {
        return this._launchConfigs;
    }

    /**
     * Resolve a launch config name to its Location in launch.json.
     */
    resolveLaunchConfig(name: string): Location | null {
        const config = this._launchConfigs.find(c => c.name === name);
        if (!config) {
            return null;
        }
        return Location.create(config.uri, Range.create(config.line, 0, config.line, 0));
    }

    /**
     * Filter launch configs whose name starts with the given prefix (case-insensitive).
     */
    filterLaunchConfigsByPrefix(prefix: string): CachedLaunchConfig[] {
        const lower = prefix.toLowerCase();
        return this._launchConfigs.filter(c => c.name.toLowerCase().startsWith(lower));
    }

    // ─── Lifecycle ───────────────────────────────────────────────────────────

    /**
     * Clear all cached data.
     */
    dispose(): void {
        this._files = [];
        this._launchConfigs = [];
    }
}
