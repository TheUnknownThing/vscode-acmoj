import * as vscode from 'vscode'
import { Submission } from '../types'
import { SubmissionService } from '../services/submissionService'
import { escapeHtml, getNonce } from '../core/utils'
import { BasePanel } from './webviewBase'

export class SubmissionDetailPanel extends BasePanel {
  protected static readonly viewType = 'acmojSubmission'
  private static readonly panels: Map<number, SubmissionDetailPanel> = new Map()

  private readonly submissionId: number
  private readonly submissionService: SubmissionService
  private currentSubmissionData: Submission | null = null // Cache data for updates

  public static createOrShow(
    extensionUri: vscode.Uri,
    submissionId: number,
    submissionService: SubmissionService,
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined

    const existingPanel = SubmissionDetailPanel.panels.get(submissionId)
    if (existingPanel) {
      existingPanel.reveal(column)
      // Optionally trigger an update if needed: existingPanel._update();
      return
    }

    const panel = vscode.window.createWebviewPanel(
      SubmissionDetailPanel.viewType,
      `Submission ${submissionId}`,
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          // Allow loading resources from node_modules/katex/dist
          vscode.Uri.joinPath(extensionUri, 'node_modules', 'katex', 'dist'),
        ],
      },
    )

    const newPanel = new SubmissionDetailPanel(
      panel,
      extensionUri,
      submissionId,
      submissionService,
    )
    SubmissionDetailPanel.panels.set(submissionId, newPanel)
    newPanel._update() // Load content initially
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    submissionId: number,
    submissionService: SubmissionService,
  ) {
    super(panel, extensionUri)
    this.submissionId = submissionId
    this.submissionService = submissionService

    const originalDispose = this.dispose
    this.dispose = () => {
      SubmissionDetailPanel.panels.delete(this.submissionId)
      originalDispose.call(this)
    }
  }

  // Public method to allow external triggers to refresh the panel
  public async refresh(): Promise<void> {
    this.panel.webview.html = this._getLoadingHtml() // Show loading state
    await this._update()
  }

  protected async _update(): Promise<void> {
    let submission: Submission
    let codeContent = 'Loading code...' // Default state

    try {
      // Fetch submission details first
      submission = await this.submissionService.getSubmissionDetails(
        this.submissionId,
      )
      this.currentSubmissionData = submission // Cache the data
      this.panel.title = `Submission ${submission.id} - ${submission.status}`
      this.panel.webview.html = this._getSubmissionHtml(submission, codeContent)

      // Then fetch code (can take longer)
      if (submission.code_url) {
        try {
          codeContent = await this.submissionService.getSubmissionCode(
            submission.id,
            submission.code_url,
          )
        } catch (codeError: any) {
          console.error(
            `Error loading code for submission ${this.submissionId}:`,
            codeError,
          )
          codeContent = `Error loading code: ${escapeHtml(codeError.message)} However, you could still try to open it in the editor.`
        }
      } else {
        codeContent = 'Code not available or permission denied.'
      }

      // Update HTML again with the fetched code
      this.panel.webview.html = this._getSubmissionHtml(submission, codeContent)
    } catch (error: any) {
      this.currentSubmissionData = null // Clear cached data on error
      this.panel.title = `Error Loading Submission ${this.submissionId}`
      this.panel.webview.html = this._getErrorHtml(
        `Failed to load submission ${this.submissionId}: ${error.message}`,
      )
      vscode.window.showErrorMessage(
        `Failed to load submission ${this.submissionId}: ${error.message}`,
      )
    }
  }

  protected _handleMessage(message: any): void {
    if (!this.currentSubmissionData) return // Don't process messages if data isn't loaded

    const submission = this.currentSubmissionData

    switch (message.command) {
      case 'abort':
        vscode.commands.executeCommand('acmoj.abortSubmission', submission.id)
        return

      case 'viewProblem':
        if (message.problemId) {
          vscode.commands.executeCommand('acmoj.viewProblem', message.problemId)
        }
        return

      case 'openInEditor':
        vscode.commands.executeCommand('acmoj.openSubmissionCode', {
          submissionId: submission.id,
          codeUrl: submission.code_url,
          language: submission.language,
          problemId: submission.problem?.id,
        })
        return
    }
  }

  private _getSubmissionHtml(
    submission: Submission,
    codeContent: string,
  ): string {
    const abortButtonHtml = submission.abort_url
      ? `<button id="abort-button">Abort Submission</button>`
      : ''
    const messageHtml = submission.message
      ? `<p><span class="label">Message:</span> ${escapeHtml(submission.message)}</p>`
      : ''
    const detailsHtml = submission.details
      ? `
            <div class="section">
                <h2>Judge Details</h2>
                ${this._formatJudgeDetails(submission.details)}
            </div>
        `
      : ''
    const problemTitleHtml = escapeHtml(submission.problem?.title || '?')
    const friendlyNameHtml = escapeHtml(submission.friendly_name)
    const codeHtml = escapeHtml(codeContent)
    const scriptNonce = getNonce()

    const content = `
            <h1>Submission #${submission.id}</h1>
            ${abortButtonHtml}

            <div class="section">
                <h2>Submission Overview</h2>
                <p><span class="label">Problem:</span> <a href="#" id="problem-link" data-problem-id="${submission.problem?.id}">${submission.problem?.id}: ${problemTitleHtml}</a></p>
                <p><span class="label">User:</span> ${friendlyNameHtml}</p>
                <p><span class="label">Language:</span> ${submission.language}</p>
                <p><span class="label">Submitted At:</span> ${new Date(submission.created_at).toLocaleString()}</p>
                ${messageHtml}
            </div>

            ${detailsHtml}

            <div class="section">
                <h2>Code</h2>
                <button id="open-in-editor-button">Open In Editor</button>
                <pre><code>${codeHtml}</code></pre>
            </div>

            <script nonce="${scriptNonce}">
                const vscode = acquireVsCodeApi();

                document.addEventListener('click', function(event) {
                    const target = event.target;
                    if (!target || !target.id) return;

                    if (target.id === 'abort-button') {
                        vscode.postMessage({ command: 'abort' });
                    }

                    if (target.id === 'open-in-editor-button') {
                        vscode.postMessage({ command: 'openInEditor' });
                    }

                    const problemLink = target.closest('#problem-link');
                    if (problemLink) {
                        const problemId = parseInt(problemLink.getAttribute('data-problem-id'));
                        if (!isNaN(problemId)) {
                            vscode.postMessage({ command: 'viewProblem', problemId: problemId });
                        }
                        event.preventDefault(); // Prevent default link behavior
                    }
                });
            </script>
        `

    return this._getWebviewHtml(content, scriptNonce)
  }

  private _formatJudgeDetails(details: any): string {
    if (!details) {
      return ''
    }

    const resultClass = `status-${details.result.toLowerCase().replace(/_/g, '-')}`

    const summaryHtml = `
            <div class="judge-summary">
            <h3 style="margin-top: 0;">Summary</h3>
            <div class="judge-summary-grid">
                <div><strong>Result:</strong> <span class="${resultClass}">${escapeHtml(details.result.toUpperCase())}</span></div>
                <div><strong>Score:</strong> ${details.score}/100</div>
                <div><strong>Total Time:</strong> ${details.resource_usage?.time_msecs || 0} ms</div>
                <div><strong>Max Memory:</strong> ${((details.resource_usage?.memory_bytes || 0) / (1024 * 1024)).toFixed(2)} MB</div>
            </div>
            </div>
        `

    let groupsHtml = ''
    if (details.groups && details.groups.length > 0) {
      details.groups.forEach((group: any, index: number) => {
        const groupResult = group.result.toLowerCase()
        const groupClass = `status-${groupResult.replace(/_/g, '-')}`

        let testpointsHtml = ''
        group.testpoints?.forEach((testpoint: any) => {
          const tpResult = testpoint.result.toLowerCase()
          const tpClass = `status-${tpResult.replace(/_/g, '-')}`

          testpointsHtml += `
                <tr>
                    <td>#${testpoint.id}</td>
                    <td><span class="${tpClass}">${escapeHtml(testpoint.result)}</span></td>
                    <td>${testpoint.score}</td>
                    <td>${testpoint.resource_usage?.time_msecs || 0} ms</td>
                    <td>${((testpoint.resource_usage?.memory_bytes || 0) / (1024 * 1024)).toFixed(2)} MB</td>
                    <td>${escapeHtml(testpoint.message) || '-'}</td>
                </tr>
                `
        })

        groupsHtml += `
                <details class="judge-group" ${index === 0 ? 'open' : ''}>
                <summary>
                    <span class="group-title">Group #${group.id}</span>
                    <span class="group-result ${groupClass}">${escapeHtml(group.result)}</span>
                    <span class="group-score">Score: ${group.score}</span>
                </summary>
                <div class="judge-group-content">
                    <table class="testpoint-table">
                    <thead>
                        <tr>
                        <th>Test</th>
                        <th>Result</th>
                        <th>Score</th>
                        <th>Time</th>
                        <th>Memory</th>
                        <th>Message</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${testpointsHtml}
                    </tbody>
                    </table>
                </div>
                </details>
            `
      })
    }

    return `
            <div class="judge-details">
            ${summaryHtml}
            <h3>Test Groups</h3>
            <div class="judge-groups">
                ${groupsHtml}
            </div>
            </div>
        `
  }
}
