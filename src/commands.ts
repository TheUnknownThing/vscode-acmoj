import * as vscode from 'vscode'
import { ApiClient } from './api'
import { AuthService } from './auth'
import { ProblemsetProvider } from './views/problemsetProvider'
import { SubmissionProvider } from './views/submissionProvider'
import { showProblemDetails, showSubmissionDetails } from './webviews'
import { exec } from 'child_process' // Node.js module to run shell commands
import { promisify } from 'util' // To use async/await with exec
import * as path from 'path' // Node.js module for path manipulation
import { get } from 'axios'

const execAsync = promisify(exec) // used in getGitRemoteFetchUrls

export function registerCommands(
  context: vscode.ExtensionContext,
  authService: AuthService,
  apiClient: ApiClient,
  problemsetProvider: ProblemsetProvider,
  submissionProvider: SubmissionProvider,
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('acmoj.setToken', async () => {
      const success = await authService.setToken()
      if (success) {
        problemsetProvider.refresh()
        submissionProvider.refresh()
      }
    }),

    vscode.commands.registerCommand('acmoj.clearToken', async () => {
      await authService.clearToken()
      problemsetProvider.refresh()
      submissionProvider.refresh()
    }),

    vscode.commands.registerCommand('acmoj.showMyProfile', () => {
      const profile = authService.getProfile()
      if (profile) {
        vscode.window.showInformationMessage(
          `Logged in as: ${profile.friendly_name} (${profile.username}), ID: ${
            profile.student_id || 'N/A'
          }`,
          { modal: false },
        )
      } else {
        vscode.window.showWarningMessage('Not logged in to ACMOJ.')
      }
    }),

    vscode.commands.registerCommand('acmoj.viewProblemById', async () => {
      if (!authService.isLoggedIn()) {
        vscode.window
          .showWarningMessage(
            'Please set your ACMOJ Personal Access Token first.',
            'Set Token',
          )
          .then((selection) => {
            if (selection === 'Set Token')
              vscode.commands.executeCommand('acmoj.setToken')
          })
        return
      }

      const problemIdStr = await vscode.window.showInputBox({
        prompt: 'Enter the Problem ID to view',
        validateInput: (text) =>
          /^\d+$/.test(text) ? null : 'Please enter a valid number ID',
      })

      if (problemIdStr) {
        const problemId = parseInt(problemIdStr, 10)
        vscode.commands.executeCommand('acmoj.viewProblem', problemId)
      }
    }),

    vscode.commands.registerCommand('acmoj.refreshProblemsets', () => {
      if (!authService.isLoggedIn()) {
        vscode.window.showWarningMessage('Please login to ACMOJ first.')
        return
      }
      problemsetProvider.refresh() // Refresh the correct provider
    }),

    vscode.commands.registerCommand('acmoj.refreshSubmissions', () => {
      if (!authService.isLoggedIn()) {
        vscode.window.showWarningMessage('Please login to ACMOJ first.')
        return
      }
      submissionProvider.refresh()
    }),

    vscode.commands.registerCommand(
      'acmoj.viewProblem',
      (problemId: number) => {
        if (!authService.isLoggedIn()) {
          vscode.window.showWarningMessage('Please login to ACMOJ first.')
          return
        }
        if (typeof problemId === 'number') {
          showProblemDetails(problemId, apiClient, context)
        } else {
          vscode.window.showErrorMessage('Invalid problem ID.')
        }
      },
    ),

    vscode.commands.registerCommand(
      'acmoj.viewSubmission',
      (submissionId: number) => {
        if (!authService.isLoggedIn()) {
          vscode.window.showWarningMessage('Please login to ACMOJ first.')
          return
        }
        if (typeof submissionId === 'number') {
          showSubmissionDetails(submissionId, apiClient, context)
        } else {
          vscode.window.showErrorMessage('Invalid submission ID.')
        }
      },
    ),

    vscode.commands.registerCommand('acmoj.submissionNextPage', () => {
      submissionProvider.nextPage()
    }),
    vscode.commands.registerCommand('acmoj.submissionPreviousPage', () => {
      submissionProvider.previousPage()
    }),
    vscode.commands.registerCommand('acmoj.submissionBackToFirstPage', () => {
      submissionProvider.resetPagination()
    }),

    vscode.commands.registerCommand(
      'acmoj.submitCurrentFile',
      async (contextArgs?: number | { problemId?: number }) => {
        if (!authService.isLoggedIn()) {
          vscode.window
            .showWarningMessage(
              'Please set your ACMOJ Personal Access Token first.',
              'Set Token',
            )
            .then((selection) => {
              if (selection === 'Set Token')
                vscode.commands.executeCommand('acmoj.setToken')
            })
          return
        }

        const editor = vscode.window.activeTextEditor
        if (!editor) {
          vscode.window.showWarningMessage('No active editor found.')
          return
        }

        const document = editor.document
        let code = document.getText()
        const fileLanguageId = document.languageId

        let problemId: number | undefined

        if (typeof contextArgs === 'number') {
          problemId = contextArgs
        } else if (typeof contextArgs === 'object' && contextArgs?.problemId) {
          // Handle message from Webview { command: 'submit', problemId: ... }
          problemId = contextArgs.problemId
        }

        let attemptedProblemId: number | undefined
        if (typeof problemId !== 'number') {
          // read the first line. if it is "// acmoj: xxx", use xxx as the problem ID
          const firstLine = code.split('\n')[0].trim()
          const matchFirstLine = firstLine.match(/(?:\/\/|#)\s*acmoj:\s*(\d+)/)
          if (matchFirstLine) {
            attemptedProblemId = parseInt(matchFirstLine[1], 10)
          } else {
            // attempt to fetch the problem ID from the file name
            const fileName = document.fileName
            const matchFileName = fileName.match(/\bP?(\d+)(?:\b|_)/)
            if (matchFileName) {
              attemptedProblemId = parseInt(matchFileName[1], 10)
            }
          }

          const problemIdStr = await vscode.window.showInputBox({
            prompt: 'Enter the Problem ID to submit to',
            validateInput: (text) =>
              /^\d+$/.test(text) ? null : 'Please enter a valid number ID',
            value: attemptedProblemId ? attemptedProblemId.toString() : '',
          })
          if (!problemIdStr) return
          problemId = parseInt(problemIdStr, 10)
        }

        let availableLanguages: string[] = [
          'cpp',
          'python',
          'java',
          'c',
          'git',
          'verilog',
        ]
        try {
          const problem = await apiClient.getProblemDetails(problemId)
          if (problem.languages_accepted) {
            availableLanguages = problem.languages_accepted
          }
        } catch (error) {
          console.warn(
            `Could not fetch accepted languages for problem ${problemId}:`,
            error,
          )
        }

        const mappedLanguage = mapLanguageId(fileLanguageId, availableLanguages)

        const languageItems: vscode.QuickPickItem[] = availableLanguages.map(
          (lang) => ({ label: lang }),
        )
        let defaultItem: vscode.QuickPickItem | undefined = undefined
        if (mappedLanguage) {
          defaultItem = languageItems.find(
            (item) => item.label === mappedLanguage,
          )
        }

        const quickPick = vscode.window.createQuickPick()
        quickPick.items = languageItems
        quickPick.title = 'Language Selection' // Optional title
        quickPick.placeholder = 'Select the language for submission'
        quickPick.canSelectMany = false // Ensure single selection
        quickPick.ignoreFocusOut = true // Keep open if focus moves elsewhere
        if (defaultItem) {
          quickPick.activeItems = [defaultItem]
        }

        const selectedLanguageItem = await new Promise<
          vscode.QuickPickItem | undefined
        >((resolve) => {
          quickPick.onDidAccept(() => {
            // User pressed Enter or clicked an item
            resolve(quickPick.selectedItems[0]) // Get the selected item
            quickPick.hide() // Close the QuickPick
          })

          quickPick.onDidHide(() => {
            // User pressed Esc or QuickPick was otherwise dismissed
            // Check if an item was already selected before hiding (less common for single select)
            if (quickPick.selectedItems.length === 0) {
              resolve(undefined) // Resolve with undefined if nothing was chosen
            }
            quickPick.dispose() // Clean up the QuickPick resources
          })

          quickPick.show() // Display the QuickPick to the user
        })

        if (!selectedLanguageItem) return // User cancelled

        const selectedLanguage = selectedLanguageItem.label

        // write the problem ID to the first line of the file if it does not exist
        if (!attemptedProblemId || attemptedProblemId !== problemId) {
          const langCommentMap = {
            cpp: '//',
            python: '#',
            java: '//',
            c: '//',
            git: '#',
            verilog: '//',
          }
          if (
            selectedLanguage in langCommentMap &&
            !(
              (fileLanguageId !== 'plaintext' && selectedLanguage === 'git') // in this setup, we don't want to overwrite the first line
            )
          ) {
            const newFirstLine = `${langCommentMap[selectedLanguage as keyof typeof langCommentMap]} acmoj: ${problemId}\n`
            const edit = new vscode.WorkspaceEdit()
            edit.replace(
              document.uri,
              new vscode.Range(0, 0, 0, 0),
              newFirstLine,
            )
            await vscode.workspace.applyEdit(edit)
          }
        }

        if (selectedLanguage === 'git') {
          // make a single-select out of all the git remote repos and a "from current file" option
          // write that literal (xxx.git) to var code
          const remoteUrls = await getGitRemoteFetchUrls(
            path.dirname(document.fileName),
          )
          const repoPath = await vscode.window.showQuickPick([
            ...remoteUrls,
            'From Current File',
          ])
          if (!repoPath) return // User cancelled
          if (repoPath !== 'From Current File') {
            // overwrite code with the selected repo
            code = repoPath
          }
        }

        const confirm = await vscode.window.showQuickPick(['Yes', 'No'], {
          placeHolder: `Submit code for Problem ${problemId} using ${selectedLanguage}?`,
        })
        if (confirm !== 'Yes') return

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `ACMOJ: Submitting P${problemId} (${selectedLanguage})...`,
            cancellable: false,
          },
          async (
            progress: vscode.Progress<{ message?: string; increment?: number }>,
          ) => {
            try {
              const result = await apiClient.submitCode(
                problemId!,
                selectedLanguage,
                code,
              )
              vscode.window.showInformationMessage(
                `Successfully submitted Problem ${problemId}. Submission ID: ${result.id}`,
              )
              submissionProvider.refresh()
              // setTimeout(() => vscode.commands.executeCommand('acmoj.viewSubmission', result.id), 3000);
            } catch (error: any) {
              vscode.window.showErrorMessage(
                `Submission failed: ${error.message}`,
              )
            }
          },
        )
      },
    ),

    vscode.commands.registerCommand(
      'acmoj.abortSubmission',
      async (submissionId: number) => {
        if (!authService.isLoggedIn()) {
          vscode.window.showWarningMessage('Please login to ACMOJ first.')
          return
        }
        if (typeof submissionId !== 'number') {
          vscode.window.showErrorMessage('Invalid submission ID.')
          return
        }

        const confirm = await vscode.window.showQuickPick(['Yes', 'No'], {
          placeHolder: `Abort submission #${submissionId}?`,
        })
        if (confirm !== 'Yes') return

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `ACMOJ: Aborting submission #${submissionId}...`,
            cancellable: false,
          },
          async (
            progress: vscode.Progress<{ message?: string; increment?: number }>,
          ) => {
            try {
              await apiClient.abortSubmission(submissionId)
              vscode.window.showInformationMessage(
                `Submission #${submissionId} aborted.`,
              )
              submissionProvider.refresh()
            } catch (error: any) {
              vscode.window.showErrorMessage(
                `Failed to abort submission: ${error.message}`,
              )
            }
          },
        )
      },
    ),

    vscode.commands.registerCommand('acmoj.clearCache', async () => {
      const confirmation = await vscode.window.showWarningMessage(
        'Are you sure you want to clear all cached data? This will refresh all problem and submission data.',
        { modal: true },
        'Confirm',
        'Cancel',
      )

      if (confirmation === 'Confirm') {
        apiClient.clearCache()
        vscode.window.showInformationMessage('All cache data has been cleared')
        // Refresh views
        problemsetProvider.refresh()
        submissionProvider.refresh()
      }
    }),
  )
}

function mapLanguageId(
  vscodeLangId: string,
  availableLangs: string[],
): string | undefined {
  const lowerId = vscodeLangId.toLowerCase()
  // only plaintext does not map to itself for all languages acmoj supports (in most cases)
  let potentialMatch = lowerId == 'plaintext' ? 'git' : lowerId
  if (potentialMatch && availableLangs.includes(potentialMatch)) {
    return potentialMatch
  }
  return undefined
}

/**
 * Executes `git remote -v` and extracts unique fetch URLs.
 * @param repoPath The absolute path to the git repository.
 * @returns A Promise resolving to an array of unique fetch URL strings.
 * @throws If git command fails (e.g., git not found, execution error).
 */
async function getGitRemoteFetchUrls(repoPath: string): Promise<string[]> {
  const command = 'git remote -v'
  const options = { cwd: path.resolve(repoPath) } // Ensure absolute path
  const fetchUrls = new Set<string>() // Use a Set for automatic deduplication

  try {
    const { stdout, stderr } = await execAsync(command, options)

    // Log stderr warnings if any, but don't treat them as fatal errors unless necessary
    if (stderr && !stderr.toLowerCase().includes('warning')) {
      console.warn(`Git stderr: ${stderr.trim()}`)
    }

    if (!stdout) {
      // No output usually means no remotes configured
      return []
    }

    const lines = stdout.trim().split('\n')
    // Regex to match lines like: origin    https://github.com/user/repo.git (fetch)
    const lineRegex = /^\S+\s+(\S+)\s+\(fetch\)$/

    for (const line of lines) {
      const match = line.match(lineRegex)
      if (match && match[1]) {
        fetchUrls.add(match[1]) // Add the captured URL (group 1)
      }
    }

    return Array.from(fetchUrls) // Convert Set to Array
  } catch (error: any) {
    // Handle specific errors gracefully
    if (
      error.stderr?.toLowerCase().includes('not a git repository') ||
      error.message?.toLowerCase().includes('not a git repository')
    ) {
      // If the folder simply isn't a repo, return empty array - not necessarily an error for the caller
      console.log(`Directory "${repoPath}" is not a Git repository.`)
      return []
    } else if (error.code === 'ENOENT') {
      // Git command not found
      throw new Error(
        `'git' command not found. Make sure Git is installed and in your system's PATH.`,
      )
    } else {
      // Other execution errors
      console.error(`Error executing 'git remote -v' in ${repoPath}:`, error)
      throw new Error(
        `Failed to list Git remotes: ${error.stderr || error.message}`,
      )
    }
  }
}
