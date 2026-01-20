// =============================================================================
// Editor Panel Renderer for Dockview
// =============================================================================

import type { IContentRenderer, GroupPanelPartInitParameters } from "dockview-core";
import * as monaco from "monaco-editor";
import { open, save } from "@tauri-apps/plugin-dialog";
import { store } from "../../../state/store";
import * as vivid from "../../../api/vivid";

// Editor instance
let editor: monaco.editor.IStandaloneCodeEditor | null = null;

// =============================================================================
// WGSL Language Definition
// =============================================================================

function registerWGSLLanguage(): void {
  // Check if already registered
  const languages = monaco.languages.getLanguages();
  if (languages.some(l => l.id === "wgsl")) return;

  monaco.languages.register({ id: "wgsl" });

  monaco.languages.setMonarchTokensProvider("wgsl", {
    keywords: [
      "fn", "let", "var", "const", "return", "if", "else", "for", "while", "loop",
      "break", "continue", "switch", "case", "default", "struct", "type", "alias",
      "true", "false", "discard", "enable", "override", "diagnostic"
    ],
    typeKeywords: [
      "bool", "i32", "u32", "f32", "f16",
      "vec2", "vec3", "vec4", "mat2x2", "mat3x3", "mat4x4",
      "sampler", "texture_2d", "texture_3d", "texture_cube",
      "array", "ptr", "atomic"
    ],
    builtins: [
      "abs", "acos", "asin", "atan", "atan2", "ceil", "clamp", "cos", "cross",
      "degrees", "distance", "dot", "exp", "exp2", "floor", "fract", "length",
      "log", "log2", "max", "min", "mix", "normalize", "pow", "radians", "reflect",
      "round", "sign", "sin", "smoothstep", "sqrt", "step", "tan", "trunc",
      "textureSample", "textureSampleLevel", "textureLoad", "textureStore"
    ],
    operators: [
      "=", ">", "<", "!", "~", "?", ":", "==", "<=", ">=", "!=",
      "&&", "||", "++", "--", "+", "-", "*", "/", "&", "|", "^", "%",
      "<<", ">>", "+=", "-=", "*=", "/=", "&=", "|=", "^=", "%=", "<<=", ">>="
    ],
    symbols: /[=><!~?:&|+\-*\/\^%]+/,
    tokenizer: {
      root: [
        [/@[a-zA-Z_]\w*/, "annotation"],
        [/[a-zA-Z_]\w*/, {
          cases: {
            "@keywords": "keyword",
            "@typeKeywords": "type",
            "@builtins": "predefined",
            "@default": "identifier"
          }
        }],
        { include: "@whitespace" },
        [/[{}()\[\]]/, "@brackets"],
        [/[<>](?!@symbols)/, "@brackets"],
        [/@symbols/, {
          cases: {
            "@operators": "operator",
            "@default": ""
          }
        }],
        [/\d*\.\d+([eE][\-+]?\d+)?[fh]?/, "number.float"],
        [/0[xX][0-9a-fA-F]+[iu]?/, "number.hex"],
        [/\d+[iu]?/, "number"],
        [/[;,.]/, "delimiter"],
        [/"([^"\\]|\\.)*$/, "string.invalid"],
        [/"/, { token: "string.quote", bracket: "@open", next: "@string" }],
      ],
      whitespace: [
        [/[ \t\r\n]+/, "white"],
        [/\/\*/, "comment", "@comment"],
        [/\/\/.*$/, "comment"],
      ],
      comment: [
        [/[^\/*]+/, "comment"],
        [/\/\*/, "comment", "@push"],
        ["\\*/", "comment", "@pop"],
        [/[\/*]/, "comment"]
      ],
      string: [
        [/[^\\"]+/, "string"],
        [/\\./, "string.escape"],
        [/"/, { token: "string.quote", bracket: "@close", next: "@pop" }]
      ],
    }
  });
}

export class EditorPanelRenderer implements IContentRenderer {
  private _element: HTMLElement;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    this._element = document.createElement("div");
    this._element.className = "editor-panel-content";

    const editorContainer = document.createElement("div");
    editorContainer.id = "editor";
    this._element.appendChild(editorContainer);
  }

  get element(): HTMLElement {
    return this._element;
  }

  init(params: GroupPanelPartInitParameters): void {
    // Initialize editor when panel is ready
    this.initEditor();

    // Handle resize
    params.api.onDidDimensionsChange(() => {
      editor?.layout();
    });

    // ResizeObserver for additional resize handling
    this.resizeObserver = new ResizeObserver(() => {
      editor?.layout();
    });
    this.resizeObserver.observe(this._element);
  }

  private initEditor(): void {
    const container = this._element.querySelector("#editor") as HTMLElement;
    if (!container) {
      console.error("[EditorPanel] Container not found");
      return;
    }

    // Register WGSL language
    registerWGSLLanguage();

    // Define dark theme
    monaco.editor.defineTheme("vivid-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6A9955" },
        { token: "keyword", foreground: "C586C0" },
        { token: "type", foreground: "4EC9B0" },
        { token: "predefined", foreground: "DCDCAA" },
        { token: "annotation", foreground: "D7BA7D" },
        { token: "number", foreground: "B5CEA8" },
        { token: "string", foreground: "CE9178" },
      ],
      colors: {
        "editor.background": "#00000000",
        "editor.lineHighlightBackground": "#ffffff10",
        "editorLineNumber.foreground": "#6e6e6e",
        "editorCursor.foreground": "#6366f1",
        "editor.selectionBackground": "#6366f133",
      }
    });

    // Create editor
    editor = monaco.editor.create(container, {
      value: "// Open a file to edit\n// Supported: .cpp, .h, .hpp, .wgsl\n",
      language: "cpp",
      theme: "vivid-dark",
      fontFamily: '"SF Mono", "Monaco", "Consolas", monospace',
      fontSize: 13,
      lineHeight: 20,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      padding: { top: 8, bottom: 8 },
      renderLineHighlight: "line",
      cursorBlinking: "smooth",
      cursorSmoothCaretAnimation: "on",
    });

    // Track modifications
    editor.onDidChangeModelContent(() => {
      const state = store.get();
      if (!state.isModified) {
        store.setModified(true);
        updateEditorUI();
      }
    });

    // Keyboard shortcut: Cmd/Ctrl+S to save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, saveFile);

    console.log("[EditorPanel] Initialized");
  }

  dispose(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    editor?.dispose();
    editor = null;
  }
}

// =============================================================================
// File Operations
// =============================================================================

function getLanguageForFile(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "cpp":
    case "c":
    case "cc":
    case "cxx":
    case "h":
    case "hpp":
    case "hxx":
      return "cpp";
    case "wgsl":
      return "wgsl";
    case "glsl":
    case "vert":
    case "frag":
      return "glsl";
    case "js":
    case "mjs":
      return "javascript";
    case "ts":
    case "mts":
      return "typescript";
    case "json":
      return "json";
    default:
      return "plaintext";
  }
}

export async function loadFile(path: string): Promise<void> {
  if (!editor) return;

  try {
    const content = await vivid.readFile(path);
    const language = getLanguageForFile(path);
    const model = monaco.editor.createModel(content, language);
    editor.setModel(model);

    store.setEditorState(path, false);
    clearErrors();
    updateEditorUI();
    console.log(`[EditorPanel] Loaded: ${path}`);
  } catch (e) {
    console.error("[EditorPanel] Failed to load file:", e);
  }
}

export async function openFile(): Promise<void> {
  try {
    const selected = await open({
      multiple: false,
      filters: [
        { name: "C++ Files", extensions: ["cpp", "h", "hpp", "c", "cc"] },
        { name: "WGSL Shaders", extensions: ["wgsl"] },
        { name: "All Files", extensions: ["*"] }
      ]
    });

    if (selected && typeof selected === "string") {
      await loadFile(selected);
    }
  } catch (e) {
    console.error("[EditorPanel] Failed to open file:", e);
  }
}

export async function saveFile(): Promise<void> {
  if (!editor) return;

  const state = store.get();

  try {
    let path = state.currentFilePath;

    // If no file open, show save dialog
    if (!path) {
      const selected = await save({
        filters: [
          { name: "C++ Files", extensions: ["cpp", "h", "hpp"] },
          { name: "WGSL Shaders", extensions: ["wgsl"] },
          { name: "All Files", extensions: ["*"] }
        ]
      });

      if (!selected) return;
      path = selected;
    }

    const content = editor.getValue();
    await vivid.writeFile(path, content);
    store.setEditorState(path, false);
    updateEditorUI();
    console.log(`[EditorPanel] Saved: ${path}`);

    // Trigger hot-reload if this is a chain source file
    if (path.endsWith(".cpp") || path.endsWith(".h") || path.endsWith(".hpp")) {
      try {
        await vivid.reloadProject();
        console.log("[EditorPanel] Hot-reload triggered");
      } catch (reloadErr) {
        console.error("[EditorPanel] Hot-reload failed:", reloadErr);
      }
    }
  } catch (e) {
    console.error("[EditorPanel] Failed to save file:", e);
  }
}

// =============================================================================
// Error Highlighting
// =============================================================================

export function highlightError(line: number, column: number, message: string): void {
  if (!editor) return;

  const model = editor.getModel();
  if (model) {
    monaco.editor.setModelMarkers(model, "vivid", [
      {
        severity: monaco.MarkerSeverity.Error,
        message: message,
        startLineNumber: line,
        startColumn: column,
        endLineNumber: line,
        endColumn: column + 1,
      },
    ]);
  }
}

export function clearErrors(): void {
  if (!editor) return;
  const model = editor.getModel();
  if (model) {
    monaco.editor.setModelMarkers(model, "vivid", []);
  }
}

export function jumpToLine(line: number, column: number): void {
  if (!editor) return;

  editor.revealLineInCenter(line);
  editor.setPosition({ lineNumber: line, column: column });
  editor.focus();

  // Add a brief highlight animation
  const model = editor.getModel();
  if (model) {
    const decorations = editor.createDecorationsCollection([
      {
        range: new monaco.Range(line, 1, line, model.getLineMaxColumn(line)),
        options: {
          className: "error-line-flash",
          isWholeLine: true,
        }
      }
    ]);

    setTimeout(() => {
      decorations.clear();
    }, 1000);
  }
}

export function goToLine(line: number): void {
  jumpToLine(line, 1);
}

// =============================================================================
// UI Updates
// =============================================================================

function updateEditorUI(): void {
  const state = store.get();
  const filenameEl = document.getElementById("editor-filename");
  const statusEl = document.getElementById("editor-status");

  if (filenameEl) {
    if (state.currentFilePath) {
      const filename = state.currentFilePath.split("/").pop() || state.currentFilePath;
      filenameEl.textContent = state.isModified ? `\u25cf ${filename}` : filename;
      filenameEl.classList.add("has-file");
    } else {
      filenameEl.textContent = "No file open";
      filenameEl.classList.remove("has-file");
    }
  }

  if (statusEl) {
    if (state.currentFilePath && state.isModified) {
      statusEl.textContent = "Modified";
      statusEl.classList.add("modified");
    } else {
      statusEl.textContent = "";
      statusEl.classList.remove("modified");
    }
  }
}

export function layout(): void {
  editor?.layout();
}

export function getEditor(): monaco.editor.IStandaloneCodeEditor | null {
  return editor;
}
