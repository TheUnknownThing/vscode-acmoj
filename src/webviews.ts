import * as vscode from 'vscode'
import { ApiClient } from './api'
import { Problem, Submission } from './types'
import MarkdownIt from 'markdown-it'
import katexPlugin from '@vscode/markdown-it-katex'

const problemPanels: Map<number, vscode.WebviewPanel> = new Map()
const submissionPanels: Map<number, vscode.WebviewPanel> = new Map()
const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: true,
}).use(katexPlugin)

/**
 * @brief show a Webview Panel with details of a problem
 * @param problemId the ID of the problem
 * @param apiClient the API client to fetch problem details
 * @param context the extension context
 */
export async function showProblemDetails(
  problemId: number,
  apiClient: ApiClient,
  context: vscode.ExtensionContext,
) {
  const column = vscode.window.activeTextEditor
    ? vscode.window.activeTextEditor.viewColumn
    : undefined

  if (problemPanels.has(problemId)) {
    problemPanels.get(problemId)?.reveal(column)
    return
  }

  // Define the path to the KaTeX distribution
  const katexDistPath = vscode.Uri.joinPath(
    context.extensionUri,
    'node_modules',
    'katex',
    'dist',
  )

  const panel = vscode.window.createWebviewPanel(
    'acmojProblem',
    `Problem ${problemId}`,
    column || vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [katexDistPath],
    },
  )
  problemPanels.set(problemId, panel)

  // Set initial loading HTML
  panel.webview.html = getWebviewContent(
    'Loading problem...',
    panel.webview,
    context.extensionUri,
  )

  try {
    const problem = await apiClient.getProblemDetails(problemId)
    panel.title = `Problem ${problem.id}: ${problem.title}`
    panel.webview.html = getProblemHtml(
      problem,
      panel.webview,
      context.extensionUri,
    )

    panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'copyToTerminal':
            try {
              const terminal =
                vscode.window.activeTerminal ||
                vscode.window.createTerminal('ACMOJ Example')
              terminal.show()
              terminal.sendText(message.content)
              vscode.window.showInformationMessage(
                'Example input copied to terminal.',
              )
            } catch (error: any) {
              vscode.window.showErrorMessage(
                `Failed to copy to terminal: ${error.message}`,
              )
            }
            return

          case 'copyToClipboard':
            try {
              await vscode.env.clipboard.writeText(message.content)
              vscode.window.showInformationMessage(
                'Example input copied to clipboard.',
              )
            } catch (error: any) {
              vscode.window.showErrorMessage(
                `Failed to copy to clipboard: ${error.message}`,
              )
            }
            return
        }
      },
      undefined,
      context.subscriptions,
    )
  } catch (error: any) {
    panel.webview.html = getWebviewContent(
      `Error loading problem ${problemId}: ${error.message}`,
      panel.webview,
      context.extensionUri,
    )
    vscode.window.showErrorMessage(
      `Failed to load problem ${problemId}: ${error.message}`,
    )
  }

  panel.onDidDispose(
    () => {
      problemPanels.delete(problemId)
    },
    null,
    context.subscriptions,
  )
}

/**
 * @brief show a Webview Panel with details of a submission
 * @param submissionId the ID of the submission
 * @param apiClient the API client to fetch submission details
 * @param context the extension context
 */
export async function showSubmissionDetails(
  submissionId: number,
  apiClient: ApiClient,
  context: vscode.ExtensionContext,
) {
  const column = vscode.window.activeTextEditor
    ? vscode.window.activeTextEditor.viewColumn
    : undefined

  if (submissionPanels.has(submissionId)) {
    submissionPanels.get(submissionId)?.reveal(column)
    return
  }

  const panel = vscode.window.createWebviewPanel(
    'acmojSubmission',
    `Submission ${submissionId}`,
    column || vscode.ViewColumn.One,
    {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(
          context.extensionUri,
          'node_modules',
          'katex',
          'dist',
        ),
      ],
    },
  )
  submissionPanels.set(submissionId, panel)

  panel.webview.html = getWebviewContent(
    'Loading submission...',
    panel.webview,
    context.extensionUri,
  )

  try {
    const submission = await apiClient.getSubmissionDetails(submissionId)
    let codeContent = submission.code_url
      ? 'Loading code...'
      : 'Code not available or permission denied.'
    panel.webview.html = getSubmissionHtml(
      submission,
      codeContent,
      panel.webview,
      context.extensionUri,
    )

    if (submission.code_url) {
      try {
        codeContent = await apiClient.getSubmissionCode(submission.code_url)
        panel.webview.html = getSubmissionHtml(
          submission,
          codeContent,
          panel.webview,
          context.extensionUri,
        )
      } catch (codeError: any) {
        panel.webview.html = getSubmissionHtml(
          submission,
          `Error loading code: ${codeError.message}`,
          panel.webview,
          context.extensionUri,
        )
      }
    }

    // handle messages (e.g. clicking "Abort")
    panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'abort':
            if (submission.abort_url) {
              vscode.commands.executeCommand(
                'acmoj.abortSubmission',
                submission.id,
              )
            }
            return

          case 'openInEditor':
            try {
              const code = await apiClient.getSubmissionCode(message.codeUrl)
              await openSubmissionCodeInEditor(
                code,
                message.language,
                message.problemId,
                message.submissionId,
              )
            } catch (error: any) {
              vscode.window.showErrorMessage(
                `Failed to open code: ${error.message}`,
              )
            }
            return
        }
      },
      undefined,
      context.subscriptions,
    )
  } catch (error: any) {
    panel.webview.html = getWebviewContent(
      `Error loading submission ${submissionId}: ${error.message}`,
      panel.webview,
      context.extensionUri,
    )
    vscode.window.showErrorMessage(
      `Failed to load submission ${submissionId}: ${error.message}`,
    )
  }

  panel.onDidDispose(
    () => {
      submissionPanels.delete(submissionId)
    },
    null,
    context.subscriptions,
  )
}

// --- HTML Generation ---

/**
 * Generates the base HTML structure, now including KaTeX assets and auto-render script.
 */
function getWebviewContent(
  content: string,
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  providedNonce?: string,
): string {
  const nonce = providedNonce || getNonce()

  const cspSource = webview.cspSource

  // --- Get URIs for KaTeX assets ---
  const katexDistUri = vscode.Uri.joinPath(
    extensionUri,
    'node_modules',
    'katex',
    'dist',
  )
  const katexCssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(katexDistUri, 'katex.min.css'),
  )
  const katexFontsUri = webview.asWebviewUri(
    vscode.Uri.joinPath(katexDistUri, 'fonts'),
  )

  // console.log("KaTeX CSS URI:", katexCssUri.toString());
  // console.log("KaTeX Fonts Directory URI:", katexFontsUri.toString());

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

    <!-- KaTeX CSS -->
    <link rel="stylesheet" href="${katexCssUri}">

    <title>ACMOJ</title>
    <style nonce="${nonce}">
        /* Basic Reset & Body */
        body {
            font-family: var(--vscode-font-family, Arial, sans-serif);
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
            padding: 1em 2em;
            line-height: 1.6;
        }
        /* Headings */
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

        /* Paragraphs and Links */
        p { margin-bottom: 1em; }
        a { color: var(--vscode-textLink-foreground); text-decoration: none; }
        a:hover { color: var(--vscode-textLink-activeForeground); text-decoration: underline; }
        a:focus { outline: 1px solid var(--vscode-focusBorder); }

        /* Code Blocks and Inline Code */
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

        /* Lists */
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
        /* Status colors */
        .status-accepted { color: var(--vscode-testing-iconPassed); }
        .status-error { color: var(--vscode-testing-iconFailed); }
        
        /* KaTeX specific styles */
        .katex {
             font-size: 1.2em; /* Slightly larger math font */
        }
        .katex-display {
             margin: 1em 0;
             text-align: center;
        }

    </style>
</head>
<body>
    ${content}
</body>
</html>`
}

/**
 * Generates the HTML content for the problem details webview, using Markdown rendering.
 */
function getProblemHtml(
  problem: Problem,
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): string {
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

  var scriptNonce = getNonce()

  const content = `
          <h1>${problem.id}: ${escapeHtml(problem.title)}</h1>
          <!--<button id="submit-button">Submit Code for this Problem</button>-->
  
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
              <div>${
                problem.languages_accepted
                  ? escapeHtml(problem.languages_accepted.join(', '))
                  : 'N/A'
              }</div>
          </div>
  
          <script nonce="${scriptNonce}">
              const vscode = acquireVsCodeApi();

              // Handle copy buttons
              document.addEventListener('click', function(event) {
                  const target = event.target;
                  
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

  const webviewHtml = getWebviewContent(
    content,
    webview,
    extensionUri,
    scriptNonce,
  )

  return webviewHtml.replace(
    '</style>',
    `
    /* Example Copy Buttons Styling */
   .example-container {
      margin-bottom: 1.5em;
    }
    .exa mple-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .copy-buttons {
      display: flex;
      gap: 4px;
    }
    .copy-btn {
      font-size: 0.8em;
      padding: 0.2em 0.5em;
      background-color: var(--vscode-button-secondaryBackground, rgba(100,100,100,0.2));
      color: var(--vscode-button-secondaryForeground);
      border: 1px solid transparent;
      border-radius: 3px;
      cursor: pointer;
    }
    .copy-btn:hover {
      background-color: var(--vscode-button-secondaryHoverBackground);
    }
    </style>`,
  )
}

/**
 * Generates the HTML content for the submission details webview.
 */
function getSubmissionHtml(
  submission: Submission,
  codeContent: string,
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): string {
  const statusClass = `status-${submission.status
    .toLowerCase()
    .replace(/_/g, '-')}`
  const abortButtonHtml = submission.abort_url
    ? `<button id="abort-button">Abort Submission</button>`
    : ''

  const messageHtml = submission.message
    ? `<p><span class="label">Message:</span> ${escapeHtml(
        submission.message,
      )}</p>`
    : ''

  // Format judge details with the new formatter instead of raw JSON
  const detailsHtml = submission.details
    ? `
        <div class="section">
            <h2>Judge Details</h2>
            ${formatJudgeDetails(submission.details)}
        </div>
    `
    : ''

  const problemTitleHtml = escapeHtml(submission.problem?.title || '?')
  const friendlyNameHtml = escapeHtml(submission.friendly_name)
  const codeHtml = escapeHtml(codeContent)

  // Generate a nonce for the script tag
  const scriptNonce = getNonce()

  const content = `
        <h1>Submission #${submission.id}</h1>
        ${abortButtonHtml}

        <div class="section">
            <h2>Details</h2>
            <p><span class="label">Problem:</span> ${
              submission.problem?.id
            }: ${problemTitleHtml}</p>
            <p><span class="label">User:</span> ${friendlyNameHtml}</p>
            <p><span class="label">Status:</span> <strong class="${statusClass}">${
              submission.status
            }</strong></p>
            ${
              submission.should_show_score && submission.score !== null
                ? `<p><span class="label">Score:</span> ${submission.score}</p>`
                : ''
            }
            <p><span class="label">Language:</span> ${submission.language}</p>
            <p><span class="label">Time:</span> ${
              submission.time_msecs !== null
                ? `${submission.time_msecs} ms`
                : 'N/A'
            }</p>
            <p><span class="label">Memory:</span> ${
              submission.memory_bytes !== null
                ? `${(submission.memory_bytes / 1024 / 1024).toFixed(2)} MB`
                : 'N/A'
            }</p>
            <p><span class="label">Submitted At:</span> ${new Date(
              submission.created_at,
            ).toLocaleString()}</p>
            ${messageHtml}
        </div>

        ${detailsHtml}

        <div class="section">
            <h2>Code</h2>
            <button id="open-in-editor-button" data-submission-id="${submission.id}" 
            data-code-url="${submission.code_url || ''}" 
            data-language="${submission.language}" 
            data-problem-id="${submission.problem?.id || 0}">Open In Editor</button>
            <pre><code>${codeHtml}</code></pre>
        </div>

        <script nonce="${scriptNonce}">
            const vscode = acquireVsCodeApi();
            
            document.addEventListener('click', function(event) {
                const target = event.target;
                
                if (target.id === 'abort-button') {
                    vscode.postMessage({ 
                        command: 'abort', 
                        submissionId: ${submission.id} 
                    });
                }
                
                if (target.id === 'open-in-editor-button') {
                    const btn = target;
                    vscode.postMessage({ 
                        command: 'openInEditor',
                        submissionId: parseInt(btn.getAttribute('data-submission-id')),
                        codeUrl: btn.getAttribute('data-code-url'),
                        language: btn.getAttribute('data-language'),
                        problemId: parseInt(btn.getAttribute('data-problem-id'))
                    });
                }
            });
        </script>
    `

  const baseWebviewHtml = getWebviewContent(
    content,
    webview,
    extensionUri,
    scriptNonce,
  )
  return baseWebviewHtml.replace(
    '</style>',
    `
    /* Judge Details Styling */
    .judge-details {
      margin: 1em 0;
    }
    .judge-summary {
      background-color: var(--vscode-editor-inactiveSelectionBackground);
      border-radius: 4px;
      padding: 0.8em;
      margin-bottom: 1em;
    }
    .judge-summary-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.5em;
    }
    .judge-groups {
      display: flex;
      flex-direction: column;
      gap: 0.5em;
    }
    .judge-group {
      border: 1px solid var(--vscode-editorWidget-border);
      border-radius: 4px;
      overflow: hidden;
    }
    .judge-group summary {
      padding: 0.6em 1em;
      background-color: var(--vscode-editor-inactiveSelectionBackground);
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
    }
    .judge-group summary:hover {
      background-color: var(--vscode-list-hoverBackground);
    }
    .judge-group-content {
      padding: 0.6em;
    }
    .testpoint-table {
      width: 100%;
      border-collapse: collapse;
    }
    .testpoint-table th, .testpoint-table td {
      padding: 0.4em 0.6em;
      text-align: left;
      border-bottom: 1px solid var(--vscode-editorWidget-border);
    }
    .group-title {
      font-weight: bold;
    }
    /* Status colors */
    .status-accepted { color: var(--vscode-testing-iconPassed, #2cbb4b); }
    .status-wrong-answer, .status-runtime-error, .status-time-limit-exceeded, 
    .status-memory-limit-exceeded, .status-failed { 
      color: var(--vscode-testing-iconFailed, #f14c4c); 
    }
    .status-partial { color: var(--vscode-charts-yellow, #e2b73d); }
    
    /* Button Styling */
    #open-in-editor-button {
      display: block;
      margin-bottom: 1em;
      cursor: pointer;
    }
    </style>`,
  )
}

/**
 * Formats the judge details into a more readable HTML structure
 */
function formatJudgeDetails(details: any): string {
  if (!details) {
    return ''
  }

  const resultClass = `status-${details.result.toLowerCase().replace(/_/g, '-')}`

  const summaryHtml = `
    <div class="judge-summary">
      <h3>Summary</h3>
      <div class="judge-summary-grid">
        <div><strong>Result:</strong> <span class="${resultClass}">${details.result.toUpperCase()}</span></div>
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
            <td><span class="${tpClass}">${testpoint.result}</span></td>
            <td>${testpoint.score}</td>
            <td>${testpoint.resource_usage?.time_msecs || 0} ms</td>
            <td>${((testpoint.resource_usage?.memory_bytes || 0) / (1024 * 1024)).toFixed(2)} MB</td>
            <td>${testpoint.message || '-'}</td>
          </tr>
        `
      })

      groupsHtml += `
        <details class="judge-group" ${index === 0 ? 'open' : ''}>
          <summary>
            <span class="group-title">Group #${group.id}</span>
            <span class="group-result ${groupClass}">${group.result}</span>
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

// simple HTML escaping
function escapeHtml(unsafe: string | null | undefined): string {
  if (unsafe === null || unsafe === undefined) return ''
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// simple rendering of content with line breaks
function getNonce(): string {
  let text = ''
  const possible =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length))
  }
  return text
}

/**
 * Open the submission code in the editor
 * @param code
 * @param language
 * @param problemId
 * @param submissionId
 */
async function openSubmissionCodeInEditor(
  code: string,
  language: string,
  problemId: number,
  submissionId: number,
): Promise<void> {
  if (!code) {
    throw new Error('Code content is empty or not available.')
  }

  const languageId = mapLanguageToVscode(language)

  const doc = await vscode.workspace.openTextDocument({
    content: code,
    language: languageId,
  })

  await vscode.window.showTextDocument(doc)

  vscode.window.showInformationMessage(
    `Have opened code for submission #${submissionId} in ${languageId} editor.`,
  )
}

/**
 * Map the language string to a VSCode language ID
 */
function mapLanguageToVscode(language: string): string {
  const languageMap: Record<string, string> = {
    cpp: 'cpp',
    'c++': 'cpp',
    c: 'c',
    java: 'java',
    python: 'python',
    python2: 'python',
    python3: 'python',
    javascript: 'javascript',
    js: 'javascript',
    typescript: 'typescript',
    ts: 'typescript',
    csharp: 'csharp',
    'c#': 'csharp',
    php: 'php',
    ruby: 'ruby',
    go: 'go',
    rust: 'rust',
    scala: 'scala',
    kotlin: 'kotlin',
    swift: 'swift',
    pascal: 'pascal',
    fortran: 'fortran',
    haskell: 'haskell',
    verilog: 'verilog',
    plaintext: 'plaintext',
    git: 'plaintext',
  }

  return languageMap[language.toLowerCase()] || 'plaintext'
}

/**
 * Get the file extension for a given language ID
 */
function getFileExtension(languageId: string): string {
  const extensionMap: Record<string, string> = {
    cpp: 'cpp',
    c: 'c',
    java: 'java',
    python: 'py',
    javascript: 'js',
    typescript: 'ts',
    csharp: 'cs',
    php: 'php',
    ruby: 'rb',
    go: 'go',
    rust: 'rs',
    scala: 'scala',
    kotlin: 'kt',
    swift: 'swift',
    pascal: 'pas',
    fortran: 'f',
    haskell: 'hs',
    verilog: 'v',
    plaintext: 'txt',
  }

  return extensionMap[languageId] || 'txt'
}
