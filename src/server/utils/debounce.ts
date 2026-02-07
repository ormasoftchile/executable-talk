/**
 * Debounce utility for LSP server.
 * Manages per-URI debounce timers for diagnostic computation.
 * Per research.md R6: 300 ms debounce per document URI.
 */

/**
 * A debounce manager that maintains one timer per key (typically document URI).
 */
export class DebounceManager {
    private readonly _timers = new Map<string, ReturnType<typeof setTimeout>>();
    private readonly _delayMs: number;

    constructor(delayMs: number = 300) {
        this._delayMs = delayMs;
    }

    /**
     * Schedule a callback for the given key. Resets any existing timer.
     */
    schedule(key: string, callback: () => void): void {
        this.cancel(key);
        const timer = setTimeout(() => {
            this._timers.delete(key);
            callback();
        }, this._delayMs);
        this._timers.set(key, timer);
    }

    /**
     * Cancel any pending timer for the given key.
     */
    cancel(key: string): void {
        const existing = this._timers.get(key);
        if (existing !== undefined) {
            clearTimeout(existing);
            this._timers.delete(key);
        }
    }

    /**
     * Cancel all pending timers.
     */
    cancelAll(): void {
        for (const timer of this._timers.values()) {
            clearTimeout(timer);
        }
        this._timers.clear();
    }

    /**
     * Check if a timer is pending for the given key.
     */
    isPending(key: string): boolean {
        return this._timers.has(key);
    }

    /**
     * Dispose all timers.
     */
    dispose(): void {
        this.cancelAll();
    }
}
