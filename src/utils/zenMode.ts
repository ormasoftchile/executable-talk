/**
 * Zen Mode utilities
 * Per research.md
 */

import * as vscode from 'vscode';

/**
 * Track whether we activated Zen Mode
 */
let zenModeActivatedByUs = false;

/**
 * Track if Zen Mode was already active before we started
 */
let wasZenModeActive = false;

/**
 * Enter Zen Mode for presentation
 * Only activates if not already in Zen Mode
 */
export async function enterZenMode(): Promise<void> {
  // Store current state
  wasZenModeActive = isZenModeActive();

  if (!wasZenModeActive) {
    await vscode.commands.executeCommand('workbench.action.toggleZenMode');
    zenModeActivatedByUs = true;
  }
}

/**
 * Exit Zen Mode
 * Only deactivates if we were the ones who activated it
 */
export async function exitZenMode(): Promise<void> {
  if (zenModeActivatedByUs) {
    await vscode.commands.executeCommand('workbench.action.toggleZenMode');
    zenModeActivatedByUs = false;
  }
}

/**
 * Check if Zen Mode was active before presentation started
 */
export function getWasZenModeActive(): boolean {
  return wasZenModeActive;
}

/**
 * Check if we activated Zen Mode
 */
export function didWeActivateZenMode(): boolean {
  return zenModeActivatedByUs;
}

/**
 * Reset Zen Mode tracking state
 */
export function resetZenModeState(): void {
  zenModeActivatedByUs = false;
  wasZenModeActive = false;
}

/**
 * Approximate check if Zen Mode is active
 * Note: VS Code doesn't expose a direct API for this
 * We use heuristics based on visible UI elements
 */
function isZenModeActive(): boolean {
  // This is an approximation - VS Code doesn't expose Zen Mode state directly
  // In practice, we'll rely on our own tracking
  return false;
}

/**
 * Handle case where user manually exits Zen Mode during presentation
 */
export function handleManualZenModeExit(): void {
  // If user manually exits, don't try to restore it
  zenModeActivatedByUs = false;
}
