import * as vscode from 'vscode'
import * as path from 'path'
import { AuthService } from '../core/auth'
import { SubmissionService } from '../services/submissionService'
import { ProblemService } from '../services/problemService'
import { WorkspaceService } from '../services/workspaceService'
import { SubmissionMonitorService } from '../services/submissionMonitorService'
import { SubmissionDetailPanel } from '../webviews/submissionDetailPanel' // Use new panel class
import { SubmissionProvider } from '../views/submissionProvider' // Needed for refresh after submit/abort

export function registerSubmissionCommands(
  context: vscode.ExtensionContext,
  authService: AuthService,
  submissionService: SubmissionService,
  problemService: ProblemService, // Needed for submit language check
  workspaceService: WorkspaceService, // Needed for submit file access
  submissionMonitor: SubmissionMonitorService,
  submissionProvider: SubmissionProvider, // Needed for refresh
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

        if (!(await authService.checkLoginAndPrompt)) return

        try {
          // Use the static method on the Panel class
          SubmissionDetailPanel.createOrShow(
            context.extensionUri,
            submissionId,
            submissionService,
          )
        } catch (error: any) {
          vscode.window.showErrorMessage(
            `Failed to show submission ${submissionId}: ${error.message}`,
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
        if (!(await authService.checkLoginAndPrompt)) return

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
            } catch (error: any) {
              vscode.window.showErrorMessage(
                `Failed to abort submission #${submissionId}: ${error.message}`,
              )
            }
          },
        )
      },
    ),

    // Command called from Webview to open code
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
        if (!(await authService.checkLoginAndPrompt)) return

        try {
          const code = await submissionService.getSubmissionCode(
            args.submissionId,
            args.codeUrl,
          ) // Fetch code via service
          await workspaceService.openCodeInEditor(
            code,
            args.language,
            args.submissionId,
          )
        } catch (error: any) {
          vscode.window.showErrorMessage(
            `Failed to open submission code: ${error.message}`,
          )
        }
      },
    ),

    // --- Submit Current File Command ---
    vscode.commands.registerCommand(
      'acmoj.submitCurrentFile',
      async (contextArgs?: number | { problemId?: number }) => {
        if (!(await authService.checkLoginAndPrompt)) return

        const editor = workspaceService.getActiveEditor()
        if (!editor) {
          vscode.window.showWarningMessage('No active editor found.')
          return
        }
        const document = editor.document
        const filePath = document.fileName
        const fileContent = document.getText()
        const fileLanguageId = document.languageId // VS Code language ID

        // --- Determine Problem ID ---
        let problemId: number | undefined
        if (typeof contextArgs === 'number') {
          problemId = contextArgs
        } else if (typeof contextArgs === 'object' && contextArgs?.problemId) {
          problemId = contextArgs.problemId
        }

        let attemptedProblemId: number | undefined
        if (typeof problemId !== 'number') {
          // Try extracting from comment first, then filename
          attemptedProblemId =
            workspaceService.extractProblemIdFromText(fileContent) ??
            workspaceService.extractProblemIdFromFileName(filePath)

          const problemIdStr = await vscode.window.showInputBox({
            prompt: 'Enter the Problem ID to submit to',
            value: attemptedProblemId?.toString() || '',
            validateInput: (text) =>
              /^\d+$/.test(text) ? null : 'Please enter a valid number ID',
            ignoreFocusOut: true,
          })
          if (!problemIdStr) return // User cancelled
          problemId = parseInt(problemIdStr, 10)
        }

        // --- Determine Language ---
        let availableLanguages: string[] = [
          'cpp',
          'python',
          'c',
          'java',
          'git',
          'verilog',
        ] // Sensible defaults
        try {
          const problemDetails =
            await problemService.getProblemDetails(problemId)
          if (
            problemDetails.languages_accepted &&
            problemDetails.languages_accepted.length > 0
          ) {
            availableLanguages = problemDetails.languages_accepted
          }
        } catch (error: any) {
          vscode.window.showWarningMessage(
            `Could not fetch accepted languages for P${problemId}. Using defaults. Error: ${error.message}`,
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

        if (!selectedLanguageItem) return // User cancelled
        const selectedLanguage = selectedLanguageItem.label

        // --- Handle Git Submission ---
        let codeToSubmit = fileContent
        if (selectedLanguage === 'git') {
          const folderPath = path.dirname(filePath)
          const remoteUrls =
            await workspaceService.getGitRemoteFetchUrls(folderPath)
          if (remoteUrls.length === 0) {
            vscode.window.showErrorMessage(
              `No Git remotes found in the folder containing the active file.`,
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

          if (!selectedRepo) return // User cancelled

          if (selectedRepo !== 'Use code from Current File instead') {
            codeToSubmit = selectedRepo // Submit the URL
          }
          // else: keep codeToSubmit as fileContent (though OJ might ignore it for 'git' type)
        }

        // --- Add/Update Problem ID Comment ---
        // Do this *before* confirmation? Or after? Let's do it before.
        if (selectedLanguage !== 'git') {
          // Don't add comment for git submissions
          await workspaceService.ensureDocumentHasProblemIdComment(
            document,
            problemId,
            fileLanguageId,
          )
          // Refetch content in case comment was added/changed
          codeToSubmit = document.getText()
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
              // Save the file before submitting? Good practice.
              await workspaceService.saveActiveDocument()

              const result = await submissionService.submitCode(
                problemId!,
                selectedLanguage,
                codeToSubmit,
              )
              vscode.window.showInformationMessage(
                `Successfully submitted P${problemId}. Submission ID: ${result.id}`,
              )
              submissionProvider.refresh() // Refresh submission list
              submissionMonitor.addSubmission(result.id)
            } catch (error: any) {
              vscode.window.showErrorMessage(
                `Submission failed for P${problemId}: ${error.message}`,
              )
            }
          },
        )
      },
    ),
  )
}
