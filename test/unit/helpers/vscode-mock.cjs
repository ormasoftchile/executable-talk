/**
 * Minimal stub for the 'vscode' module used in unit tests that transitively
 * import VS Code-dependent source files (e.g. src/renderer/commandRenderer.ts).
 *
 * Only stubs what the renderer chain needs at *module load time* — none of
 * the real runtime APIs are exercised during headless unit tests.
 *
 * This file is registered via --require in the test:unit mocha script.
 */

'use strict';

const Module = require('module');

const vscodeMock = {
  commands: {
    executeCommand: async () => undefined,
  },
  workspace: {
    workspaceFolders: undefined,
    textDocuments: [],
    onDidChangeTextDocument: () => ({ dispose: () => {} }),
    openTextDocument: async (uri) => ({ uri, lineCount: 1, getText: () => '' }),
    createFileSystemWatcher: () => ({
      onDidChange: () => ({ dispose: () => {} }),
      onDidCreate: () => ({ dispose: () => {} }),
      onDidDelete: () => ({ dispose: () => {} }),
      dispose: () => {},
    }),
    fs: {
      readFile: async () => Buffer.from(''),
    },
  },
  Uri: {
    file: (p) => ({ fsPath: p, path: p, toString: () => p }),
    parse: (s) => ({ fsPath: s, path: s, toString: () => s }),
    joinPath: (...parts) => {
      const path = require('path');
      const resolved = parts
        .map((part) => (typeof part === 'string' ? part : (part.fsPath || part.path || String(part))))
        .reduce((acc, part) => path.join(acc, part));
      return { fsPath: resolved, path: resolved, toString: () => resolved };
    },
  },
  window: {
    showErrorMessage: () => {},
    showInformationMessage: () => {},
    createOutputChannel: () => ({ appendLine: () => {}, show: () => {}, dispose: () => {} }),
    activeColorTheme: { kind: 2 },
    onDidChangeTextEditorSelection: () => ({ dispose: () => {} }),
    showTextDocument: async (document) => ({
      document,
      selection: undefined,
      revealRange: () => {},
    }),
    createWebviewPanel: (_viewType, _title, _column, _options) => ({
      webview: {
        html: '',
        cspSource: 'vscode-resource:',
        asWebviewUri: (uri) => uri,
        postMessage: async () => true,
        onDidReceiveMessage: () => ({ dispose: () => {} }),
      },
      title: '',
      reveal: () => {},
      dispose: () => {},
      onDidDispose: (cb) => { cb(); return { dispose: () => {} }; },
      viewColumn: 2,
    }),
  },
  env: { shell: '' },
  EventEmitter: class { on() {} off() {} fire() {} },
  Disposable: class { dispose() {} },
  ThemeColor: class { constructor(id) { this.id = id; } },
  RelativePattern: class { constructor(baseUri, pattern) { this.baseUri = baseUri; this.pattern = pattern; } },
  ViewColumn: {
    One: 1,
    Two: 2,
    Three: 3,
    Four: 4,
    Five: 5,
    Six: 6,
    Seven: 7,
    Eight: 8,
    Nine: 9,
    Active: -1,
    Beside: -2,
  },
  Position: class { constructor(line, character) { this.line = line; this.character = character; } },
  Selection: class { constructor(anchor, active) { this.anchor = anchor; this.active = active; } },
  Range: class { constructor(start, end) { this.start = start; this.end = end; } },
  TextEditorRevealType: { InCenterIfOutsideViewport: 0 },
  ColorThemeKind: {
    Light: 1,
    Dark: 2,
    HighContrast: 3,
    HighContrastLight: 4,
  },
};

// Intercept Node's module resolver so any `require('vscode')` or
// `import … from 'vscode'` resolves to this stub.
const originalResolve = Module._resolveFilename.bind(Module);
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'vscode') {
    return '__vscode_stub__';
  }
  return originalResolve(request, parent, isMain, options);
};

// Register the stub exports under the synthetic filename.
require.cache['__vscode_stub__'] = {
  id: '__vscode_stub__',
  filename: '__vscode_stub__',
  loaded: true,
  exports: vscodeMock,
  parent: null,
  children: [],
  paths: [],
};
