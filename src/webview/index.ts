/**
 * Webview module exports
 */

export { WebviewProvider, WebviewCallbacks } from './webviewProvider';
export { PresenterViewProvider } from './presenterViewProvider';
export type {
  WebviewToHostMessage,
  HostToWebviewMessage,
  NavigateMessage,
  ExecuteActionMessage,
  SlideChangedPayload,
  DeckLoadedPayload,
  ErrorPayload,
  TrustStatusChangedPayload,
} from './messages';
export {
  isWebviewMessage,
  isNavigateMessage,
  isExecuteActionMessage,
  getMessageType,
  createMessageDispatcher,
  parseMessage,
} from './messageHandler';
