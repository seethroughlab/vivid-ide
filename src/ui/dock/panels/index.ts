// =============================================================================
// Panel Creation Functions Export
// =============================================================================

export { createTerminalPanel, getTerminal, fit as fitTerminal, focus as focusTerminal } from "./TerminalPanel";
export { createEditorPanel, loadFile, openFile, saveFile, highlightError, clearErrors, jumpToLine, goToLine, layout as layoutEditor, getEditor } from "./EditorPanel";
export { createInspectorPanel } from "./InspectorPanel";
export { createConsolePanel, logInfo, logSuccess, logWarning, logError, clearConsole } from "./ConsolePanel";
