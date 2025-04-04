// src/commands/problemCommands.ts
import * as vscode from 'vscode'
import { AuthService } from '../core/auth'
import { ProblemService } from '../services/problemService'
import { WorkspaceService } from '../services/workspaceService'
import { ProblemDetailPanel } from '../webviews/problemDetailPanel' // Use new panel class

// Helper function for login check
async function checkLoginAndPrompt(authService: AuthService): Promise<boolean> {
  if (!authService.isLoggedIn()) {
    const selection = await vscode.window.showWarningMessage(
      'Please set your ACMOJ Personal Access Token first.',
      'Set Token',
      'Cancel',
    )
    if (selection === 'Set Token') {
      await vscode.commands.executeCommand('acmoj.setToken')
      // Re-check login status after attempting to set token
      return authService.isLoggedIn()
    }
    return false // User cancelled or didn't set token
  }
  return true
}

export function registerProblemCommands(
  context: vscode.ExtensionContext,
  authService: AuthService,
  problemService: ProblemService,
  workspaceService: WorkspaceService, // Potentially needed later
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('acmoj.viewProblemById', async () => {
      if (!(await checkLoginAndPrompt(authService))) return

      const problemIdStr = await vscode.window.showInputBox({
        prompt: 'Enter the Problem ID to view',
        validateInput: (text) =>
          /^\d+$/.test(text) ? null : 'Please enter a valid number ID',
      })

      if (problemIdStr) {
        const problemId = parseInt(problemIdStr, 10)
        // Execute the specific view command directly
        vscode.commands.executeCommand('acmoj.viewProblem', problemId)
      }
    }),

    vscode.commands.registerCommand(
      'acmoj.viewProblem',
      async (problemId: number | unknown) => {
        // Command can be called from TreeView (number) or elsewhere (unknown)
        if (typeof problemId !== 'number') {
          // Maybe try to get from context or show input box?
          console.warn('viewProblem called without a valid number ID.')
          vscode.window.showErrorMessage('Invalid or missing problem ID.')
          return // Or trigger 'acmoj.viewProblemById'
        }

        if (!(await checkLoginAndPrompt(authService))) return

        try {
          // Use the static method on the Panel class
          ProblemDetailPanel.createOrShow(
            context.extensionUri,
            problemId,
            problemService,
          )
        } catch (error: any) {
          vscode.window.showErrorMessage(
            `Failed to show problem ${problemId}: ${error.message}`,
          )
        }
      },
    ),

    // Command for copying example to terminal (called from webview)
    vscode.commands.registerCommand(
      'acmoj.copyToTerminal',
      (content: string) => {
        if (typeof content !== 'string') return
        try {
          const terminal =
            vscode.window.activeTerminal ||
            vscode.window.createTerminal('ACMOJ Example')
          terminal.show()
          // Send text ensuring it handles potential newlines correctly for the shell
          terminal.sendText(content, true) // Second arg adds newline, usually desired
          vscode.window.showInformationMessage(
            'Example input sent to active/new terminal.',
          )
        } catch (error: any) {
          vscode.window.showErrorMessage(
            `Failed to copy to terminal: ${error.message}`,
          )
        }
      },
    ),

    // Potentially add 'acmoj.submitFromProblemView' command here later
  )
}
