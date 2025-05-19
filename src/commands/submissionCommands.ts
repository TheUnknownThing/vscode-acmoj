import * as vscode from 'vscode'
import * as path from 'path'
import { AuthService } from '../core/auth'
import { SubmissionService } from '../services/submissionService'
import { ProblemService } from '../services/problemService'
import { WorkspaceService, PreSubmitResult } from '../services/workspaceService' // PreSubmitResult is used
import { SubmissionMonitorService } from '../services/submissionMonitorService'
import { SubmissionDetailPanel } from '../webviews/submissionDetailPanel'
import { SubmissionProvider } from '../views/submissionProvider'

export function registerSubmissionCommands(
  context: vscode.ExtensionContext,
  authService: AuthService,
  submissionService: SubmissionService,
  problemService: ProblemService,
  workspaceService: WorkspaceService,
  submissionMonitor: SubmissionMonitorService,
  submissionProvider: SubmissionProvider,
) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'acmoj.viewSubmission',
      async (submissionId: number | unknown) => {
        if (typeof submissionId !== 'number') {
          console.warn('viewSubmission called without a valid number ID.')
          vscode.window.showErrorMessage('Invalid or missing submission ID.')
          return
        }
        if (!(await authService.checkLoginAndPrompt())) return

        try {
          SubmissionDetailPanel.createOrShow(
            context.extensionUri,
            submissionId,
            submissionService,
          )
        } catch (error: unknown) {
          let message = 'Unknown error'
          if (error instanceof Error) message = error.message
          vscode.window.showErrorMessage(
            `Failed to show submission ${submissionId}: ${message}`,
          )
        }
      },
    ),

    vscode.commands.registerCommand(
      'acmoj.abortSubmission',
      async (submissionId: number | unknown) => {
        if (typeof submissionId !== 'number') {
          vscode.window.showErrorMessage(
            'Invalid submission ID provided for abort.',
          )
          return
        }
        if (!(await authService.checkLoginAndPrompt())) return

        const confirm = await vscode.window.showQuickPick(['Yes', 'No'], {
          placeHolder: `Abort submission #${submissionId}? This cannot be undone.`,
          ignoreFocusOut: true,
        })
        if (confirm !== 'Yes') return

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `ACMOJ: Aborting submission #${submissionId}...`,
            cancellable: false,
          },
          async () => {
            try {
              await submissionService.abortSubmission(submissionId)
              vscode.window.showInformationMessage(
                `Submission #${submissionId} aborted.`,
              )
              submissionProvider.refresh()
            } catch (error: unknown) {
              let message = 'Unknown error'
              if (error instanceof Error) message = error.message
              vscode.window.showErrorMessage(
                `Failed to abort submission #${submissionId}: ${message}`,
              )
            }
          },
        )
      },
    ),

    vscode.commands.registerCommand(
      'acmoj.openSubmissionCode',
      async (args: {
        submissionId: number
        codeUrl: string
        language: string
        problemId?: number
      }) => {
        if (!args || typeof args.submissionId !== 'number') {
          vscode.window.showErrorMessage(
            'Invalid arguments for opening submission code.',
          )
          return
        }
        if (!(await authService.checkLoginAndPrompt())) return

        try {
          const code = await submissionService.getSubmissionCode(
            args.submissionId,
            args.codeUrl,
          )
          await workspaceService.openCodeInEditor(
            code,
            args.language,
            args.submissionId,
          )
        } catch (error: unknown) {
          let message = 'Unknown error'
          if (error instanceof Error) message = error.message
          vscode.window.showErrorMessage(
            `Failed to open submission code: ${message}`,
          )
        }
      },
    ),

    vscode.commands.registerCommand(
      'acmoj.submitCurrentFile',
      async (contextArgs?: number | { problemId?: number }) => {
        if (!(await authService.checkLoginAndPrompt())) return

        const editor = workspaceService.getActiveEditor()
        if (!editor) {
          vscode.window.showWarningMessage('No active editor found.')
          return
        }
        const document = editor.document
        const filePath = document.fileName
        const initialFileContent = document.getText() // Keep original for fallback if hooks don't run
        const fileLanguageId = document.languageId

        let problemId: number | undefined
        if (typeof contextArgs === 'number') {
          problemId = contextArgs
        } else if (typeof contextArgs === 'object' && contextArgs?.problemId) {
          problemId = contextArgs.problemId
        }

        if (typeof problemId !== 'number') {
          const attemptedProblemId =
            workspaceService.extractProblemIdFromText(initialFileContent) ??
            workspaceService.extractProblemIdFromFileName(filePath)

          const problemIdStr = await vscode.window.showInputBox({
            prompt: 'Enter the Problem ID to submit to',
            value: attemptedProblemId?.toString() || '',
            validateInput: (text) =>
              /^\d+$/.test(text) ? null : 'Please enter a valid number ID',
            ignoreFocusOut: true,
          })
          if (!problemIdStr) return
          problemId = parseInt(problemIdStr, 10)
        }

        let availableLanguages: string[] = [
          'cpp',
          'python',
          'java',
          'git',
          'verilog',
        ]
        try {
          const problemDetails =
            await problemService.getProblemDetails(problemId)
          if (
            problemDetails.languages_accepted &&
            problemDetails.languages_accepted.length > 0
          ) {
            availableLanguages = problemDetails.languages_accepted
          }
        } catch (error: unknown) {
          let message = 'Unknown error'
          if (error instanceof Error) message = error.message
          vscode.window.showWarningMessage(
            `Could not fetch accepted languages for P${problemId}. Using defaults. Error: ${message}`,
          )
        }

        const mappedLanguage = workspaceService.mapLanguageIdToOJFormat(
          fileLanguageId,
          availableLanguages,
        )
        const languageItems: vscode.QuickPickItem[] = availableLanguages.map(
          (lang) => ({
            label: lang,
            description: lang === mappedLanguage ? '(Suggested)' : undefined,
          }),
        )

        const selectedLanguageItem = await vscode.window.showQuickPick(
          languageItems,
          {
            title: `Select Language for P${problemId}`,
            placeHolder: 'Choose the submission language',
            canPickMany: false,
            ignoreFocusOut: true,
          },
        )
        if (!selectedLanguageItem) return
        const selectedLanguage = selectedLanguageItem.label

        let codeToSubmitForOJ = initialFileContent // Default to initial content
        let hookResult: PreSubmitResult | undefined = undefined

        // --- PRE-SUBMIT HOOKS ---
        if (selectedLanguage !== 'git') {
          try {
            await workspaceService.saveActiveDocument() // Save before hooks
            const currentContentForHooks = document.getText() // Re-read after save

            // processPreSubmitHooks will return a result even if no hooks file is found
            // or if hooks run but don't use 'submit' output.
            hookResult = await workspaceService.processPreSubmitHooks(
              document,
              currentContentForHooks,
            )

            if (hookResult.error) {
              // This error is from parsing pre-submit.json or a non-critical hook failure
              vscode.window.showErrorMessage(
                `Pre-submit hooks problem: ${hookResult.error}. Submission aborted.`,
              )
              return
            }
            // At this point, hookResult.content contains the processed content
            // and hookResult.outputUsed indicates if 'submit' was used.
          } catch (criticalHookError: unknown) {
            // This catch block is for critical errors thrown by processPreSubmitHooks
            // (e.g., a hook script/command exited with an error code and was configured to halt)
            if (criticalHookError instanceof Error) {
              vscode.window.showErrorMessage(
                `A critical pre-submit hook failed: ${criticalHookError.message}. Submission aborted.`,
              )
            } else {
              vscode.window.showErrorMessage(
                `A critical pre-submit hook encountered an unknown error. Submission aborted.`,
              )
            }
            return
          }
        }
        // --- END PRE-SUBMIT HOOKS ---

        // --- Determine Final Code to Submit and Handle Problem ID Comment ---
        if (hookResult && hookResult.outputUsed) {
          // If hooks used 'output: "submit"', their combined output is the code to submit.
          codeToSubmitForOJ = hookResult.content
          // Still add problem ID to the *source file* for user convenience,
          // but it doesn't affect the `codeToSubmitForOJ`.
          if (selectedLanguage !== 'git') {
            await workspaceService.ensureDocumentHasProblemIdComment(
              document,
              problemId,
              fileLanguageId,
            )
          }
        } else if (hookResult) {
          // Hooks ran, but did not use 'output: "submit"'.
          // The content might have been modified by actions or piped.
          codeToSubmitForOJ = hookResult.content
          if (selectedLanguage !== 'git') {
            await workspaceService.ensureDocumentHasProblemIdComment(
              document,
              problemId,
              fileLanguageId,
            )
            // Since outputUsed is false, the submission should reflect the final state of the source file.
            codeToSubmitForOJ = document.getText()
          }
        } else {
          // No hooks ran (e.g., selectedLanguage was 'git', or no pre-submit.json)
          // codeToSubmitForOJ remains initialFileContent at this stage.
          // Add problem ID comment to the source file.
          if (selectedLanguage !== 'git') {
            await workspaceService.ensureDocumentHasProblemIdComment(
              document,
              problemId,
              fileLanguageId,
            )
            codeToSubmitForOJ = document.getText() // Use the potentially modified document content
          }
        }

        // --- Handle Git Submission (if selectedLanguage is 'git', hooks were skipped) ---
        if (selectedLanguage === 'git') {
          const folderPath = path.dirname(filePath)
          const remoteUrls =
            await workspaceService.getGitRemoteFetchUrls(folderPath)
          if (remoteUrls.length === 0) {
            vscode.window.showErrorMessage(
              `No Git remotes found in the folder for ${filePath}.`,
            )
            return
          }
          const repoOptions = [
            ...remoteUrls,
            'Use code from Current File instead',
          ]
          const selectedRepo = await vscode.window.showQuickPick(repoOptions, {
            title: 'Select Git Repository URL or Use File Content',
            placeHolder: 'Choose the Git URL to submit',
            ignoreFocusOut: true,
          })

          if (!selectedRepo) return
          if (selectedRepo !== 'Use code from Current File instead') {
            codeToSubmitForOJ = selectedRepo // Submit the URL
          }
          // else: codeToSubmitForOJ remains what it was (initialFileContent if hooks were skipped)
        }

        // --- Confirmation ---
        const confirm = await vscode.window.showQuickPick(['Yes', 'No'], {
          placeHolder: `Submit P${problemId} using ${selectedLanguage}?`,
          ignoreFocusOut: true,
        })
        if (confirm !== 'Yes') return

        // --- Execute Submission ---
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `ACMOJ: Submitting P${problemId} (${selectedLanguage})...`,
            cancellable: false,
          },
          async () => {
            try {
              const result = await submissionService.submitCode(
                problemId!,
                selectedLanguage,
                codeToSubmitForOJ, // Use the final determined code
              )
              vscode.window.showInformationMessage(
                `Successfully submitted P${problemId}. Submission ID: ${result.id}`,
              )
              submissionMonitor.addSubmission(result.id)
              submissionProvider.refresh()
            } catch (error: unknown) {
              let message = 'Unknown error'
              if (error instanceof Error) message = error.message
              vscode.window.showErrorMessage(
                `Submission failed for P${problemId}: ${message}`,
              )
            }
          },
        )
      },
    ),
  )
}
