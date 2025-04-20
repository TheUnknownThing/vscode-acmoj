import * as vscode from 'vscode'
import { AuthService } from '../core/auth'
import { ProblemService } from '../services/problemService'
import { ProblemDetailPanel } from '../webviews/problemDetailPanel'

export function registerProblemCommands(
  context: vscode.ExtensionContext,
  authService: AuthService,
  problemService: ProblemService,
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('acmoj.viewProblemById', async () => {
      if (!(await authService.checkLoginAndPrompt)) return

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
          console.warn('viewProblem called without a valid number ID.')
          vscode.window.showErrorMessage('Invalid or missing problem ID.')
          return
        }

        if (!(await authService.checkLoginAndPrompt)) return

        try {
          // Use the static method on the Panel class
          ProblemDetailPanel.createOrShow(
            context.extensionUri,
            problemId,
            problemService,
          )
        } catch (error: unknown) {
          let message = 'Unknown error'
          if (error instanceof Error) {
            message = error.message
          }
          vscode.window.showErrorMessage(
            `Failed to show problem ${problemId}: ${message}`,
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
          terminal.sendText(content, true) // Second arg adds newline, usually desired
          vscode.window.showInformationMessage(
            'Example input sent to active/new terminal.',
          )
        } catch (error: unknown) {
          let message = 'Unknown error'
          if (error instanceof Error) {
            message = error.message
          }
          vscode.window.showErrorMessage(
            `Failed to copy to terminal: ${message}`,
          )
        }
      },
    ),

    // Placeholder for 'acmoj.submitFromProblemView' I would implement it later
  )
}
