import * as vscode from 'vscode'
import MarkdownIt from 'markdown-it'
import katexPlugin from '@vscode/markdown-it-katex'
import { Problem } from '../types'
import { ProblemService } from '../services/problemService'
import { escapeHtml, getNonce } from '../core/utils'
import { BasePanel } from './webviewBase'

// Initialize Markdown-it instance specifically for problems
const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true,
}).use(katexPlugin)

export class ProblemDetailPanel extends BasePanel {
  protected static readonly viewType = 'acmojProblem'
  private static readonly panels: Map<number, ProblemDetailPanel> = new Map()

  private readonly problemId: number
  private readonly problemService: ProblemService

  public static createOrShow(
    extensionUri: vscode.Uri,
    problemId: number,
    problemService: ProblemService,
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined

    // If we already have a panel, show it.
    const existingPanel = ProblemDetailPanel.panels.get(problemId)
    if (existingPanel) {
      existingPanel.reveal(column)
      return
    }

    // Otherwise, create a new panel.
    const panel = vscode.window.createWebviewPanel(
      ProblemDetailPanel.viewType,
      `Problem ${problemId}`,
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'node_modules', 'katex', 'dist'),
        ],
      },
    )

    const newPanel = new ProblemDetailPanel(
      panel,
      extensionUri,
      problemId,
      problemService,
    )
    ProblemDetailPanel.panels.set(problemId, newPanel)
    newPanel._update() // Load content initially
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    problemId: number,
    problemService: ProblemService,
  ) {
    super(panel, extensionUri)
    this.problemId = problemId
    this.problemService = problemService

    // Add disposal cleanup specific to this panel type
    const originalDispose = this.dispose
    this.dispose = () => {
      ProblemDetailPanel.panels.delete(this.problemId)
      originalDispose.call(this)
    }
  }

  protected async _update(): Promise<void> {
    try {
      const problem = await this.problemService.getProblemDetails(
        this.problemId,
      )
      this.panel.title = `Problem ${problem.id}: ${problem.title}`
      this.panel.webview.html = this._getProblemHtml(problem)
    } catch (error: any) {
      this.panel.title = `Error Loading Problem ${this.problemId}`
      this.panel.webview.html = this._getErrorHtml(
        `Failed to load problem ${this.problemId}: ${error.message}`,
      )
      vscode.window.showErrorMessage(
        `Failed to load problem ${this.problemId}: ${error.message}`,
      )
    }
  }

  protected _handleMessage(message: any): void {
    switch (message.command) {
      case 'copyToTerminal':
        // Use a dedicated command for better testability and separation
        vscode.commands.executeCommand('acmoj.copyToTerminal', message.content)
        return

      case 'copyToClipboard':
        vscode.env.clipboard.writeText(message.content).then(
          () =>
            vscode.window.showInformationMessage(
              'Example input copied to clipboard.',
            ),
          (err) =>
            vscode.window.showErrorMessage(
              `Failed to copy to clipboard: ${err.message}`,
            ),
        )
        return

      // TODO: I'll add submitFromProblemView here later
    }
  }

  private _getProblemHtml(problem: Problem): string {
    const descriptionHtml = md.render(
      problem.description || '*No description provided.*',
    )
    const inputHtml = md.render(problem.input || '*No input format specified.*')
    const outputHtml = md.render(
      problem.output || '*No output format specified.*',
    )
    const dataRangeHtml = md.render(
      problem.data_range || '*No data range specified.*',
    )

    let examplesHtml = ''
    if (problem.examples && problem.examples.length > 0) {
      examplesHtml = problem.examples
        .map(
          (ex, i) => `
                    <div class="example-container">
                        <div class="example-header">
                        <h4>Example ${escapeHtml(ex.name) || i + 1}</h4>
                        <div class="copy-buttons">
                            ${ex.input ? `<button class="copy-btn copy-to-terminal" data-content="${escapeHtml(ex.input)}" title="Copy input to terminal">⤷ Terminal</button>` : ''}
                            ${ex.input ? `<button class="copy-btn copy-to-clipboard" data-content="${escapeHtml(ex.input)}" title="Copy input to clipboard">⎘ Clipboard</button>` : ''}
                        </div>
                        </div>
                        ${ex.description ? `<p>${escapeHtml(ex.description)}</p>` : ''}
                        ${
                          ex.input !== undefined && ex.input !== null
                            ? `<h5>Input:</h5><pre><code>${escapeHtml(
                                ex.input,
                              )}</code></pre>`
                            : ''
                        }
                        ${
                          ex.output !== undefined && ex.output !== null
                            ? `<h5>Output:</h5><pre><code>${escapeHtml(
                                ex.output,
                              )}</code></pre>`
                            : ''
                        }
                    </div>
                `,
        )
        .join('')
    } else if (problem.example_input || problem.example_output) {
      // Legacy examples
      examplesHtml = `
                    <div class="example-container">
                        <div class="example-header">
                        <h4>Example</h4>
                        <div class="copy-buttons">
                            ${problem.example_input ? `<button class="copy-btn copy-to-terminal" data-content="${escapeHtml(problem.example_input)}" title="Copy input to terminal">⤷ Terminal</button>` : ''}
                            ${problem.example_input ? `<button class="copy-btn copy-to-clipboard" data-content="${escapeHtml(problem.example_input)}" title="Copy input to clipboard">⎘ Clipboard</button>` : ''}
                        </div>
                        </div>
                        ${
                          problem.example_input
                            ? `<h5>Input:</h5><pre><code>${escapeHtml(
                                problem.example_input,
                              )}</code></pre>`
                            : ''
                        }
                        ${
                          problem.example_output
                            ? `<h5>Output:</h5><pre><code>${escapeHtml(
                                problem.example_output,
                              )}</code></pre>`
                            : ''
                        }
                    </div>
                `
    }

    const scriptNonce = getNonce()
    const content = `
            <h1>${problem.id}: ${escapeHtml(problem.title)}</h1>
            <!-- <button id="submit-button">Submit Code for this Problem</button> -->

            <div class="section">
                <h2>Description</h2>
                <div>${descriptionHtml}</div>
            </div>

            <div class="section">
                <h2>Input Format</h2>
                <div>${inputHtml}</div>
            </div>

            <div class="section">
                <h2>Output Format</h2>
                <div>${outputHtml}</div>
            </div>

            <div class="section">
                <h2>Examples</h2>
                ${examplesHtml || '*No examples provided.*'}
            </div>

            <div class="section">
                <h2>Data Range</h2>
                <div>${dataRangeHtml}</div>
            </div>

            <div class="section">
                <h2>Accepted Languages</h2>
                <div>${problem.languages_accepted ? escapeHtml(problem.languages_accepted.join(', ')) : 'N/A'}</div>
            </div>

            <script nonce="${scriptNonce}">
                const vscode = acquireVsCodeApi();

                // Handle copy buttons
                document.addEventListener('click', function(event) {
                    const target = event.target;
                    if (!target || !target.classList) return;

                    if (target.classList.contains('copy-to-terminal')) {
                        const content = target.getAttribute('data-content');
                        vscode.postMessage({
                            command: 'copyToTerminal',
                            content: content
                        });
                    }

                    if (target.classList.contains('copy-to-clipboard')) {
                        const content = target.getAttribute('data-content');
                        vscode.postMessage({
                            command: 'copyToClipboard',
                            content: content
                        });
                    }
                });
            </script>
        `

    return this._getWebviewHtml(content, scriptNonce)
  }
}
