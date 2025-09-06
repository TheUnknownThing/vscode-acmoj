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
    } catch (error: unknown) {
      let message = 'Unknown error'
      if (error instanceof Error) {
        message = error.message
      }
      this.panel.title = `Error Loading Problem ${this.problemId}`
      this.panel.webview.html = this._getErrorHtml(
        `Failed to load problem ${this.problemId}: ${message}`,
      )
      vscode.window.showErrorMessage(
        `Failed to load problem ${this.problemId}: ${message}`,
      )
    }
  }

  protected _handleMessage(message: unknown): void {
    if (
      typeof message === 'object' &&
      message !== null &&
      'command' in message
    ) {
      const msg = message as {
        command: string
        content?: string
        name?: string
        url?: string
      }
      switch (msg.command) {
        case 'copyToTerminal':
          vscode.commands.executeCommand('acmoj.copyToTerminal', msg.content)
          return

        case 'copyToClipboard':
          vscode.env.clipboard.writeText(msg.content ?? '').then(
            () =>
              vscode.window.showInformationMessage(
                'Example input copied to clipboard.',
              ),
            (err) =>
              vscode.window.showErrorMessage(
                `Failed to copy to clipboard: ${err instanceof Error ? err.message : String(err)}`,
              ),
          )
          return

        case 'downloadAttachment':
          if (msg.name && msg.url) {
            this.downloadAttachment(msg.name, msg.url).catch((err) =>
              vscode.window.showErrorMessage(
                `Download failed: ${err instanceof Error ? err.message : String(err)}`,
              ),
            )
          }
          return
      }
    }
  }

  private _getProblemHtml(problem: Problem): string {
    // Safely read attachments from problem without depending on Problem type update
    const attachments =
      (
        problem as unknown as {
          attachments?: Array<{
            name: string
            size_bytes: number
            url: string
          }> | null
        }
      ).attachments ?? null

    // Replace [attachment]filename[/attachment] with anchor + Download button, then render via Markdown
    const renderWithAttachments = (
      text: string | null | undefined,
      emptyFallbackMd: string,
    ): string => {
      const source = text ?? ''
      const map = new Map((attachments ?? []).map((a) => [a.name, a]))
      const replaced = source.replace(
        /\[attachment\](.*?)\[\/attachment\]/gis,
        (_m, name: string) => {
          const key = String(name).trim()
          const item = map.get(key)
          if (item) {
            const safeName = escapeHtml(item.name)
            const safeUrl = escapeHtml(item.url)
            return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeName}</a>
              <button class="download-attachment" data-name="${safeName}" data-url="${safeUrl}" title="Download attachment">Download</button>`
          }
          // If not found, show the plain text name
          return escapeHtml(key)
        },
      )
      return md.render(replaced || emptyFallbackMd)
    }

    const descriptionHtml = renderWithAttachments(
      problem.description,
      '*No description provided.*',
    )
    const inputHtml = renderWithAttachments(
      problem.input,
      '*No input format specified.*',
    )
    const outputHtml = renderWithAttachments(
      problem.output,
      '*No output format specified.*',
    )
    const dataRangeHtml = renderWithAttachments(
      problem.data_range,
      '*No data range specified.*',
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
                        ${ex.description ? `<div class="example-description">${renderWithAttachments(ex.description, '')}</div>` : ''}
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

    const attachmentsSectionHtml =
      attachments && attachments.length > 0
        ? `<ul>${attachments
            .map((a) => {
              const safeName = escapeHtml(a.name)
              const safeUrl = escapeHtml(a.url)
              return `<li>
                <a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeName}</a>
                <button class="download-attachment" data-name="${safeName}" data-url="${safeUrl}" title="Download attachment">⬇ Download</button>
                - ${a.size_bytes} bytes
              </li>`
            })
            .join('')}</ul>`
        : md.render('*No attachments.*')

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
                ${examplesHtml || md.render('*No examples provided.*')}
            </div>

            <div class="section">
                <h2>Data Range</h2>
                <div>${dataRangeHtml}</div>
            </div>

            <div class="section">
                <h2>Accepted Languages</h2>
                <div>${problem.languages_accepted ? escapeHtml(problem.languages_accepted.join(', ')) : 'N/A'}</div>
            </div>

            <div class="section">
                <h2>Attachments</h2>
                <div>${attachmentsSectionHtml}</div>
            </div>

            <script nonce="${scriptNonce}">
                const vscode = acquireVsCodeApi();

                // Handle copy / download buttons
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

                    if (target.classList.contains('download-attachment')) {
                        const name = target.getAttribute('data-name');
                        const url = target.getAttribute('data-url');
                        vscode.postMessage({
                            command: 'downloadAttachment',
                            name,
                            url
                        });
                    }
                });
            </script>
        `

    return this._getWebviewHtml(content, scriptNonce)
  }

  // --- Attachment download implementation ---

  private getPreferredDownloadMode(): 'workspace' | 'ask' {
    const cfg = vscode.workspace.getConfiguration('onlineJudge')
    const mode =
      cfg.get<'workspace' | 'ask'>('attachments.downloadLocationMode') ??
      'workspace'
    return mode
  }

  private getWorkspaceDownloadDir(): vscode.Uri | null {
    const ws = vscode.workspace.workspaceFolders
    if (!ws || ws.length === 0) return null
    // {workspace}/.acmoj/problem-{id}
    return vscode.Uri.joinPath(ws[0].uri, '.acmoj', `problem-${this.problemId}`)
  }

  private async ensureDir(uri: vscode.Uri): Promise<void> {
    await vscode.workspace.fs.createDirectory(uri)
  }

  private async exists(uri: vscode.Uri): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(uri)
      return true
    } catch {
      return false
    }
  }

  private async uniqueTarget(
    dir: vscode.Uri,
    baseName: string,
  ): Promise<vscode.Uri> {
    let candidate = vscode.Uri.joinPath(dir, baseName)
    if (!(await this.exists(candidate))) return candidate

    const dot = baseName.lastIndexOf('.')
    const stem = dot > 0 ? baseName.slice(0, dot) : baseName
    const ext = dot > 0 ? baseName.slice(dot) : ''
    let i = 1
    // Generate "name (1).ext" style
    while (await this.exists(candidate)) {
      candidate = vscode.Uri.joinPath(dir, `${stem} (${i})${ext}`)
      i++
    }
    return candidate
  }

  private async askTargetFile(): Promise<vscode.Uri | undefined> {
    return vscode.window.showSaveDialog({
      saveLabel: 'Save Attachment',
      filters: { 'All Files': ['*'] },
      // defaultUri intentionally omitted so the OS picks a sensible default
    })
  }

  private async fetchAsUint8Array(
    url: string,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    // Use fetch from the extension host (Node 18+ includes fetch)
    const res = await fetch(url, { signal })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`)
    }
    const buf = await res.arrayBuffer()
    return new Uint8Array(buf)
  }

  private async downloadAttachment(name: string, url: string): Promise<void> {
    // Determine target based on user setting and workspace availability
    const mode = this.getPreferredDownloadMode() // 'workspace' | 'ask'
    let targetFile: vscode.Uri | undefined

    if (mode === 'workspace') {
      const dir = this.getWorkspaceDownloadDir()
      if (!dir) {
        // No workspace — fallback to Ask
        targetFile = await this.askTargetFile()
      } else {
        await this.ensureDir(dir)
        // Handle conflicts with prompt
        const candidate = vscode.Uri.joinPath(dir, name)
        let finalTarget = candidate
        if (await this.exists(candidate)) {
          const choice = await vscode.window.showWarningMessage(
            `File ${name} already exists. What do you want to do?`,
            'Overwrite',
            'Keep Both',
            'Cancel',
          )
          if (choice === 'Cancel' || !choice) return
          if (choice === 'Keep Both') {
            finalTarget = await this.uniqueTarget(dir, name)
          }
          // Overwrite uses candidate as-is
        }
        targetFile = finalTarget
      }
    } else {
      targetFile = await this.askTargetFile()
    }

    if (!targetFile) return

    // Download with progress and cancellable
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Downloading ${name}`,
        cancellable: true,
      },
      async (progress, token) => {
        progress.report({ message: 'Starting...' })

        // Wire cancellation
        const controller = new AbortController()
        token.onCancellationRequested(() => controller.abort())

        // Fetch into memory then write via VS Code FS API
        const content = await this.fetchAsUint8Array(url, controller.signal)
        progress.report({ message: 'Saving...' })
        await vscode.workspace.fs.writeFile(targetFile!, content)

        // Offer actions
        const action = await vscode.window.showInformationMessage(
          `Downloaded: ${name}`,
          'Open File',
          'Show in Explorer',
        )
        if (action === 'Open File') {
          await vscode.commands.executeCommand('vscode.open', targetFile)
        } else if (action === 'Show in Explorer') {
          await vscode.commands.executeCommand('revealInExplorer', targetFile)
        }
      },
    )
  }
}
