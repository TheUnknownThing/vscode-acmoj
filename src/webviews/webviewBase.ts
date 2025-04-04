import * as vscode from 'vscode'
import { getNonce } from '../core/utils'

export abstract class BasePanel {
  protected static readonly viewType = 'acmojBasePanel'
  protected readonly panel: vscode.WebviewPanel
  protected readonly extensionUri: vscode.Uri
  protected disposables: vscode.Disposable[] = []

  protected constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this.panel = panel
    this.extensionUri = extensionUri

    // Set up listeners
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables)
    this.panel.webview.onDidReceiveMessage(
      (message) => this._handleMessage(message),
      null,
      this.disposables,
    )

    // Set initial content
    this.panel.webview.html = this._getLoadingHtml()
  }

  public dispose() {
    // Clean up resources
    this.panel.dispose()
    while (this.disposables.length) {
      const x = this.disposables.pop()
      if (x) {
        x.dispose()
      }
    }
  }

  public reveal(column?: vscode.ViewColumn) {
    this.panel.reveal(column)
  }

  protected abstract _handleMessage(message: any): void
  protected abstract _update(): Promise<void> // Make update async

  protected _getLoadingHtml(): string {
    return this._getWebviewHtml('<h1>Loading...</h1>')
  }

  protected _getErrorHtml(errorMessage: string): string {
    return this._getWebviewHtml(`<h1>Error</h1><p>${errorMessage}</p>`)
  }

  // Generates the base HTML structure, including KaTeX assets and CSP.
  protected _getWebviewHtml(content: string, scriptNonce?: string): string {
    const webview = this.panel.webview
    const nonce = scriptNonce || getNonce() // Use provided nonce for script or generate new

    const cspSource = webview.cspSource

    // --- Get URIs for KaTeX assets ---
    const katexDistUri = vscode.Uri.joinPath(
      this.extensionUri,
      'node_modules',
      'katex',
      'dist',
    )
    const katexCssUri = webview.asWebviewUri(
      vscode.Uri.joinPath(katexDistUri, 'katex.min.css'),
    )

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="
        default-src 'none';
        style-src ${webview.cspSource} 'unsafe-inline';
        font-src ${webview.cspSource};
        img-src ${webview.cspSource} https: data:;
        script-src 'nonce-${nonce}';
    ">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="${katexCssUri}">
    <title>ACMOJ</title>
    <style nonce="${nonce}">
        body {
            font-family: var(--vscode-font-family, Arial, sans-serif);
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
            padding: 1em 2em;
            line-height: 1.6;
        }
        
        h1, h2, h3, h4, h5, h6 {
            margin-top: 1.2em;
            margin-bottom: 0.6em;
            font-weight: 600;
            color: var(--vscode-textLink-foreground); /* Make headings stand out a bit */
        }
        h1 { font-size: 1.8em; border-bottom: 1px solid var(--vscode-editorWidget-border, #ccc); padding-bottom: 0.3em; }
        h2 { font-size: 1.5em; border-bottom: 1px solid var(--vscode-editorWidget-border, #ccc); padding-bottom: 0.3em; }
        h3 { font-size: 1.3em; }
        h4 { font-size: 1.1em; }

        p { margin-bottom: 1em; }
        a { color: var(--vscode-textLink-foreground); text-decoration: none; }
        a:hover { color: var(--vscode-textLink-activeForeground); text-decoration: underline; }
        a:focus { outline: 1px solid var(--vscode-focusBorder); }

        pre, code {
            font-family: var(--vscode-editor-font-family, Consolas, 'Courier New', monospace);
            font-size: 0.95em;
        }
        code { /* Inline code */
            background-color: var(--vscode-textCodeBlock-background);
            padding: 0.2em 0.4em;
            border-radius: 3px;
        }
        pre { /* Code block */
            background-color: var(--vscode-textCodeBlock-background);
            padding: 1em;
            border-radius: 4px;
            overflow-x: auto; /* Allow horizontal scrolling for long lines */
            margin-bottom: 1em;
        }
        pre code { /* Reset styles for code inside pre */
            background-color: transparent;
            padding: 0;
            border-radius: 0;
        }

        ul, ol { padding-left: 2em; margin-bottom: 1em; }
        li { margin-bottom: 0.4em; }

        /* Blockquotes */
        blockquote {
            margin: 1em 0;
            padding: 0.5em 1em;
            border-left: 0.25em solid var(--vscode-editorWidget-border, #ccc);
            background-color: var(--vscode-textBlockQuote-background);
            color: var(--vscode-textBlockQuote-foreground);
        }
        blockquote p { margin-bottom: 0.5em; }

        /* Tables (Basic Styling) */
        table {
            border-collapse: collapse;
            margin: 1em 0;
            width: auto;
            border: 1px solid var(--vscode-editorWidget-border, #ccc);
        }
        th, td {
            border: 1px solid var(--vscode-editorWidget-border, #ccc);
            padding: 0.5em 0.8em;
            text-align: left;
        }
        th {
            background-color: var(--vscode-toolbar-hoverBackground);
            font-weight: 600;
        }
        thead {
             border-bottom: 2px solid var(--vscode-editorWidget-border, #ccc);
        }

        /* Other Styles */
        .section { margin-bottom: 2em; }
        .label { font-weight: bold; min-width: 100px; display: inline-block;}
        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: 1px solid var(--vscode-button-border, transparent);
            padding: 0.5em 1em;
            border-radius: 2px;
            cursor: pointer;
            margin-right: 0.5em;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        button:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }
        
        /* Example Copy Buttons Styling */
        .example-container { margin-bottom: 1.5em; }
        .example-header { display: flex; justify-content: space-between; align-items: center; }
        .copy-buttons { display: flex; gap: 4px; }
        .copy-btn { font-size: 0.8em; padding: 0.2em 0.5em; background-color: var(--vscode-button-secondaryBackground, rgba(100,100,100,0.2)); color: var(--vscode-button-secondaryForeground); border: 1px solid transparent; border-radius: 3px; cursor: pointer; }
        .copy-btn:hover { background-color: var(--vscode-button-secondaryHoverBackground); }

        /* Judge Details Styling */
        .judge-details { margin: 1em 0; }
        .judge-summary { background-color: var(--vscode-editor-inactiveSelectionBackground); border-radius: 4px; padding: 0.8em; margin-bottom: 1em; }
        .judge-summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5em; }
        .judge-groups { display: flex; flex-direction: column; gap: 0.5em; }
        .judge-group { border: 1px solid var(--vscode-editorWidget-border); border-radius: 4px; overflow: hidden; }
        .judge-group summary { padding: 0.6em 1em; background-color: var(--vscode-editor-inactiveSelectionBackground); display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
        .judge-group summary:hover { background-color: var(--vscode-list-hoverBackground); }
        .judge-group-content { padding: 0.6em; }
        .testpoint-table { width: 100%; border-collapse: collapse; }
        .testpoint-table th, .testpoint-table td { padding: 0.4em 0.6em; text-align: left; border-bottom: 1px solid var(--vscode-editorWidget-border); }
        .group-title { font-weight: bold; }
        .status-accepted { color: var(--vscode-testing-iconPassed, #2cbb4b); }
        .status-wrong-answer, .status-runtime-error, .status-time-limit-exceeded,
        .status-memory-limit-exceeded, .status-failed { color: var(--vscode-testing-iconFailed, #f14c4c); }
        .status-partial { color: var(--vscode-charts-yellow, #e2b73d); }
        #open-in-editor-button { display: block; margin-bottom: 1em; cursor: pointer; }
        .katex { font-size: 1.2em; }
        .katex-display { margin: 1em 0; text-align: center; }
    </style>
</head>
<body>
    ${content}
</body>
</html>`
  }
}
