/**
 * Workspace Trust utilities
 * Per research.md
 */

import * as vscode from 'vscode';

/**
 * Check if the current workspace is trusted
 */
export function isTrusted(): boolean {
  return vscode.workspace.isTrusted;
}

/**
 * Register a handler for trust changes
 * @returns Disposable to unregister the handler
 */
export function onTrustChanged(
  handler: (trusted: boolean) => void
): vscode.Disposable {
  return vscode.workspace.onDidGrantWorkspaceTrust(() => {
    handler(true);
  });
}

/**
 * Request workspace trust from the user
 * @param message Message to display to user
 * @returns true if trust was granted
 */
export async function requestTrust(message?: string): Promise<boolean> {
  if (isTrusted()) {
    return true;
  }

  const result = await vscode.window.showWarningMessage(
    message || 'This action requires workspace trust. Do you want to trust this workspace?',
    'Trust Workspace',
    'Cancel'
  );

  if (result === 'Trust Workspace') {
    // VS Code will show its own trust dialog
    await vscode.commands.executeCommand('workbench.trust.manage');
    return isTrusted();
  }

  return false;
}

/**
 * Check if an action requiring trust can be executed
 * @param actionType The type of action for error messaging
 * @returns true if action can proceed
 */
export function canExecuteTrustedAction(actionType: string): boolean {
  if (!isTrusted()) {
    void vscode.window.showWarningMessage(
      `Action "${actionType}" requires workspace trust. Please trust this workspace to execute this action.`
    );
    return false;
  }
  return true;
}
