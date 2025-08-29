import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs/promises'
import { exec, spawn } from 'child_process' // Added spawn for stdin piping
import { promisify } from 'util'
import { mapLanguageToVscode } from '../core/utils'

const execAsync = promisify(exec)

export type HookInstance =
  | {
      type: 'action'
      name: string
      description?: string
    }
  | {
      type: 'command'
      content: string
      output?: 'show' | 'ignore' | 'pipe' | 'submit'
      description?: string
    }
  | {
      type: 'script'
      path: string
      output?: 'show' | 'ignore' | 'pipe' | 'submit'
      description?: string
    }

export interface PreSubmitResult {
  content: string
  error?: string
  outputUsed: boolean // True if any hook used output: 'submit'
}

export class WorkspaceService {
  private preSubmitOutputChannel: vscode.OutputChannel | undefined

  constructor() {
    // Initialize the output channel for pre-submit hooks
    // This is done once when the service is created.
  }

  private getPreSubmitOutputChannel(): vscode.OutputChannel {
    if (!this.preSubmitOutputChannel) {
      this.preSubmitOutputChannel = vscode.window.createOutputChannel(
        'ACMOJ Pre-Submit Hooks',
      )
    }
    return this.preSubmitOutputChannel
  }

  getActiveEditor(): vscode.TextEditor | undefined {
    return vscode.window.activeTextEditor
  }

  /**
   * Gets the document from the currently active text editor.
   * @returns The active document or undefined if none is active
   */
  getActiveDocument(): vscode.TextDocument | undefined {
    return vscode.window.activeTextEditor?.document
  }

  /**
   * Opens code in a new editor with proper language highlighting.
   * @param code - The code content to open
   * @param language - The programming language of the code
   * @param submissionId - The submission ID for reference
   * @throws Error if code content is empty
   */
  async openCodeInEditor(
    code: string,
    language: string,
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
      `Opened code for submission #${submissionId} in ${languageId} editor.`,
    )
  }

  /**
   * Saves the currently active document if it has unsaved changes.
   * @returns True if document was saved or already saved, false if save failed
   */
  async saveActiveDocument(): Promise<boolean> {
    const document = this.getActiveDocument()
    if (document && document.isDirty) {
      return await document.save()
    }
    return true
  }

  /**
   * Ensures a document has a problem ID comment in the first line.
   * Adds or updates the comment if needed.
   * @param document - The document to check
   * @param problemId - The problem ID to include in comment
   * @param languageId - The language ID for comment syntax
   */
  async ensureDocumentHasProblemIdComment(
    document: vscode.TextDocument,
    problemId: number,
    languageId: string,
  ): Promise<void> {
    const firstLine = document.lineAt(0).text
    const commentRegex = /(?:^\s*(?:\/\/|#)\s*acmoj:)\s*(\d+)/
    const match = firstLine.match(commentRegex)
    let existingId: number | null = null
    if (match && match[1]) existingId = parseInt(match[1], 10)
    if (existingId === problemId) return

    const langCommentMap: Record<string, string> = {
      cpp: '//',
      python: '#',
      java: '//',
      verilog: '//',
    }
    const commentPrefix = langCommentMap[languageId.toLowerCase()]
    if (!commentPrefix) {
      console.warn(
        `No comment prefix for ${languageId}. Cannot add problem ID.`,
      )
      return
    }
    const newCommentLine = `${commentPrefix} acmoj: ${problemId}\n`
    const edit = new vscode.WorkspaceEdit()
    if (match) {
      edit.replace(
        document.uri,
        new vscode.Range(0, 0, 0, firstLine.length),
        newCommentLine.trim(),
      )
    } else {
      edit.insert(document.uri, new vscode.Position(0, 0), newCommentLine)
    }
    if (await vscode.workspace.applyEdit(edit)) {
      await document.save()
    } else {
      vscode.window.showErrorMessage('Failed to add problem ID comment.')
    }
  }

  extractProblemIdFromText(text: string): number | undefined {
    const firstLine = text.split('\n', 1)[0].trim()
    const match = firstLine.match(/(?:\/\/|#)\s*acmoj:s*(\d+)/)
    return match && match[1] ? parseInt(match[1], 10) : undefined
  }

  extractProblemIdFromFileName(filePath: string): number | undefined {
    const fileName = path.basename(filePath)
    const match = fileName.match(/(?:\b|_|^v)P?(\d+)(?:\b|_|\.[^.]*$)/)
    return match && match[1] ? parseInt(match[1], 10) : undefined
  }

  async getGitRemoteFetchUrls(folderPath?: string): Promise<string[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders
    let repoPath = folderPath
    if (!repoPath) {
      if (workspaceFolders && workspaceFolders.length > 0) {
        repoPath = workspaceFolders[0].uri.fsPath
      } else {
        // vscode.window.showWarningMessage('Cannot determine Git repository path. No folder open.'); // Already handled by caller
        return []
      }
    }
    if (!repoPath) return []

    const command = 'git remote -v'
    const options = { cwd: path.resolve(repoPath) }
    const fetchUrls = new Set<string>()
    try {
      const { stdout, stderr } = await execAsync(command, options)

      if (stderr && !stderr.toLowerCase().includes('warning')) {
        console.warn(`Git stderr from ${repoPath}: ${stderr.trim()}`)
      }
      if (!stdout) return []
      const lines = stdout.trim().split('\n')
      const lineRegex = /^\S+\s+(\S+)\s+\(fetch\)$/
      for (const line of lines) {
        const match = line.match(lineRegex)
        if (match && match[1]) fetchUrls.add(match[1])
      }
      return Array.from(fetchUrls)
    } catch (error: unknown) {
      let stderrMessage = ''
      let message = ''
      let code: unknown = undefined
      if (typeof error === 'object' && error !== null) {
        if (
          'stderr' in error &&
          typeof (error as { stderr?: unknown }).stderr === 'string'
        ) {
          stderrMessage = (error as { stderr?: string }).stderr ?? ''
        }
        if (
          'message' in error &&
          typeof (error as { message?: unknown }).message === 'string'
        ) {
          message = (error as { message?: string }).message ?? ''
        }
        if ('code' in error) {
          code = (error as { code?: unknown }).code
        }
      }
      if (
        stderrMessage.toLowerCase().includes('not a git repository') ||
        message.toLowerCase().includes('not a git repository')
      ) {
        console.log(`Directory "${repoPath}" is not a Git repository.`)
        return []
      } else if (code === 'ENOENT') {
        vscode.window.showErrorMessage(
          `'git' command not found. Make sure Git is installed and in your system's PATH.`,
        )
        return []
      } else {
        console.error(`Error executing 'git remote -v' in ${repoPath}:`, error)
        vscode.window.showErrorMessage(
          `Failed to list Git remotes: ${stderrMessage || message}`,
        )
        return []
      }
    }
  }

  /**
   * Maps VSCode language ID to Online Judge language format.
   * @param vscodeLangId - The VSCode language ID
   * @param availableLangs - Array of languages supported by the problem
   * @returns The matching OJ language format or undefined if no match
   */
  mapLanguageIdToOJFormat(
    vscodeLangId: string,
    availableLangs: string[],
  ): string | undefined {
    const lowerId = vscodeLangId.toLowerCase()
    const directMap: Record<string, string> = {
      cpp: 'cpp',
      c: 'cpp',
      java: 'java',
      python: 'python',
      verilog: 'verilog',
      git: 'plaintext',
    }
    let potentialMatch: string | undefined = directMap[lowerId]
    if (potentialMatch && availableLangs.includes(potentialMatch))
      return potentialMatch
    if (availableLangs.includes(lowerId)) return lowerId
    for (const lang of availableLangs) if (lang.startsWith(lowerId)) return lang
    return undefined
  }

  private substituteVariables(
    template: string,
    variables: Record<string, string>,
    excludeKeys: string[] = [],
  ): string {
    let result = template
    for (const key in variables) {
      if (excludeKeys.includes(key)) continue
      const regex = new RegExp(`\\$\\{${key}\\}`, 'g')
      result = result.replace(regex, variables[key])
    }
    return result
  }
  // --- End of methods from your provided code ---

  async processPreSubmitHooks(
    document: vscode.TextDocument,
    initialFileContent: string,
  ): Promise<PreSubmitResult> {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri)
    if (!workspaceFolder) {
      return {
        content: initialFileContent,
        outputUsed: false,
        error: undefined,
      }
    }

    const preSubmitJsonPath = path.join(
      workspaceFolder.uri.fsPath,
      '.acmoj',
      'pre-submit.json',
    )
    let hooks: HookInstance[] = []

    try {
      const rawConfig = await fs.readFile(preSubmitJsonPath, 'utf-8')
      const parsedConfig = JSON.parse(rawConfig)
      if (!Array.isArray(parsedConfig)) {
        throw new Error('.acmoj/pre-submit.json should be an array.')
      }
      hooks = parsedConfig as HookInstance[]
    } catch (error: unknown) {
      if (
        error != null &&
        error instanceof Object &&
        'code' in error &&
        (error as { code: unknown }).code === 'ENOENT'
      ) {
        return {
          content: initialFileContent,
          outputUsed: false,
          error: undefined,
        }
      }
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error('Error processing .acmoj/pre-submit.json:', error)
      return {
        content: initialFileContent,
        error: `Error in .acmoj/pre-submit.json: ${errorMsg}`,
        outputUsed: false,
      }
    }

    if (hooks.length === 0) {
      return {
        content: initialFileContent,
        outputUsed: false,
        error: undefined,
      }
    }

    const outputChannel = this.getPreSubmitOutputChannel() // For logging hook execution
    outputChannel.clear()
    outputChannel.appendLine(
      `[${new Date().toLocaleTimeString()}] Running pre-submit hooks for ${document.fileName}`,
    )

    let currentFileContentForHooks = initialFileContent // For $ACMOJ_FILE_CONTENT env var
    let currentInputForNextPipe: string | undefined = undefined // For stdin of next command/script
    let preSubmitStringAccumulator: string[] = []
    let anyOutputSubmitUsed = false

    const originalFilePath = document.uri.fsPath
    const originalFileName = path.basename(originalFilePath)
    const originalFileNameNoSuffix = originalFileName.includes('.')
      ? originalFileName.substring(0, originalFileName.lastIndexOf('.'))
      : originalFileName
    const originalFileDir = path.dirname(originalFilePath)

    for (let i = 0; i < hooks.length; i++) {
      const hook = hooks[i]
      const hookDisplayName =
        hook.description ||
        (hook.type === 'action'
          ? hook.name
          : hook.type === 'command'
            ? hook.content.split(' ')[0]
            : hook.type === 'script'
              ? path.basename(hook.path)
              : `hook #${i + 1}`)

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `ACMOJ: Pre-submit: ${hookDisplayName}`,
          cancellable: false,
        },
        async (progress) => {
          try {
            // Variables are updated every cycle
            const allHookVariables: Record<string, string> = {
              ACMOJ_FILE_PATH: originalFilePath,
              ACMOJ_FILE_NAME: originalFileName,
              ACMOJ_FILE_NAME_NO_SUFFIX: originalFileNameNoSuffix,
              ACMOJ_FILE_DIR: originalFileDir,
              ACMOJ_FILE_CONTENT: currentFileContentForHooks, // Reflects current file state
            }

            if (hook.type === 'action') {
              progress.report({
                message: `Executing VS Code action: ${hook.name}`,
              })
              const actionName = this.substituteVariables(
                hook.name,
                allHookVariables,
              )
              await vscode.commands.executeCommand(actionName)

              if (
                vscode.window.activeTextEditor &&
                vscode.window.activeTextEditor.document === document
              ) {
                currentFileContentForHooks =
                  vscode.window.activeTextEditor.document.getText()
              }
              outputChannel.appendLine(
                `[OK] Action '${actionName}' executed. File content for next hook updated.`,
              )
              currentInputForNextPipe = undefined // Actions don't pipe to stdin
            } else if (hook.type === 'command' || hook.type === 'script') {
              let commandToExecute: string
              let commandParts: string[] // For spawn

              if (hook.type === 'command') {
                const substitutedContent = this.substituteVariables(
                  hook.content,
                  allHookVariables,
                  ['ACMOJ_FILE_CONTENT'],
                )
                // A simple way to split command and args for spawn, might need refinement for complex cases (quotes, etc.)
                commandParts =
                  substitutedContent.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ||
                  []
                commandToExecute = commandParts[0] // The command itself
                if (!commandToExecute)
                  throw new Error(
                    `Command hook content is empty or invalid: "${hook.content}"`,
                  )
              } else {
                // script
                const scriptPath = path.resolve(
                  workspaceFolder.uri.fsPath,
                  hook.path,
                )
                const substitutedPath = this.substituteVariables(
                  scriptPath,
                  allHookVariables,
                  ['ACMOJ_FILE_CONTENT'],
                )
                commandParts = [substitutedPath] // Script path is the command
                commandToExecute = commandParts[0]
              }
              progress.report({
                message: `Executing: ${commandParts.join(' ')}`,
              })

              const shellPath =
                process.env.SHELL ||
                (process.platform === 'win32' ? 'powershell.exe' : '/bin/sh')

              // Use spawn for better stdin/stdout/stderr handling
              const processPromise = new Promise<{
                stdout: string
                stderr: string
              }>((resolve, reject) => {
                // For 'command' type, if shell is true, it's better to pass the whole string to the shell.
                // For 'script' type, directly executing the script might be better.
                // Let's use a consistent shell execution for now for simplicity, but this can be refined.
                // If using shell: true with spawn, the command is the shell, and args are like ['-c', 'actual command string']

                const fullCommandString = commandParts.join(' ') // Reconstruct for shell -c
                const child = spawn(shellPath, ['-c', fullCommandString], {
                  cwd: originalFileDir,
                  env: { ...process.env, ...allHookVariables },
                  shell: false, // We are explicitly invoking the shell with -c
                })

                let stdoutData = ''
                let stderrData = ''

                if (child.stdin && currentInputForNextPipe !== undefined) {
                  child.stdin.write(currentInputForNextPipe)
                  child.stdin.end()
                } else if (child.stdin) {
                  child.stdin.end() // Important to close stdin if no input
                }

                child.stdout?.on('data', (data) => {
                  stdoutData += data.toString()
                })
                child.stderr?.on('data', (data) => {
                  stderrData += data.toString()
                })

                child.on('error', (err) => reject(err))
                child.on('close', (code) => {
                  if (code === 0) {
                    resolve({ stdout: stdoutData, stderr: stderrData })
                  } else {
                    reject(
                      new Error(
                        `Command "${fullCommandString}" exited with code ${code}.\nStderr: ${stderrData}\nStdout: ${stdoutData}`,
                      ),
                    )
                  }
                })
              })

              const { stdout, stderr } = await processPromise
              currentInputForNextPipe = undefined // Reset for next hook unless 'pipe' is set

              const outputMode = hook.output || 'ignore'

              if (stderr) {
                // Log all stderr to console for debugging
                console.warn(
                  `ACMOJ Pre-submit ${hook.type} '${hookDisplayName}' stderr:\n${stderr}`,
                )
              }

              outputChannel.appendLine(
                `[OK] ${hook.type} '${hookDisplayName}' executed.`,
              )

              if (outputMode === 'show') {
                if (stdout.trim())
                  vscode.window.showInformationMessage(
                    `Output from "${hookDisplayName}":\n${stdout.trim()}`,
                  )
                if (stderr.trim())
                  vscode.window.showWarningMessage(
                    `Error output from "${hookDisplayName}":\n${stderr.trim()}`,
                  )
                // currentInputForNextPipe remains undefined
              } else if (outputMode === 'pipe') {
                currentInputForNextPipe = stdout
                outputChannel.appendLine(
                  `[PIPE] Output of '${hookDisplayName}' will be piped as stdin to the next hook.`,
                )
              } else if (outputMode === 'submit') {
                preSubmitStringAccumulator.push(stdout)
                anyOutputSubmitUsed = true
                outputChannel.appendLine(
                  `[SUBMIT] Output of '${hookDisplayName}' appended to submission string.`,
                )
                // currentInputForNextPipe remains undefined
              }
              // 'ignore': currentInputForNextPipe remains undefined
            }
          } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : String(err)
            console.error(
              `Error executing pre-submit hook ${hookDisplayName}:`,
              err,
            )
            outputChannel.appendLine(
              `[ERROR] Hook ${hookDisplayName} failed: ${errorMsg}`,
            )
            outputChannel.show(true)
            throw new Error(`Hook ${hookDisplayName} failed: ${errorMsg}`)
          }
        },
      )
    }

    let finalContentToSubmit: string
    if (anyOutputSubmitUsed) {
      finalContentToSubmit = preSubmitStringAccumulator.join('')
      outputChannel.appendLine(
        "Final submission content is combined from 'submit' hooks.",
      )
    } else {
      // If no 'submit' output, the "submission" is the original file content (potentially modified by actions)
      // Piping does not alter the file content itself for submission purposes unless 'submit' is used.
      finalContentToSubmit = currentFileContentForHooks
      outputChannel.appendLine(
        'Final submission content is the current file content (after actions, if any).',
      )
    }

    outputChannel.appendLine('All pre-submit hooks completed.')
    return {
      content: finalContentToSubmit,
      outputUsed: anyOutputSubmitUsed,
      error: undefined,
    }
  }
}
