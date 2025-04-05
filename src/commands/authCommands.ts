import * as vscode from 'vscode'
import { AuthService } from '../core/auth'
import { UserService } from '../services/userService'
import { ProblemsetProvider } from '../views/problemsetProvider' // For refresh
import { SubmissionProvider } from '../views/submissionProvider' // For refresh

export function registerAuthCommands(
  context: vscode.ExtensionContext,
  authService: AuthService,
  userService: UserService, // Inject UserService
  problemsetProvider: ProblemsetProvider, // For refresh on login/logout
  submissionProvider: SubmissionProvider, // For refresh on login/logout
) {
  context.subscriptions.push(
    vscode.commands.registerCommand('acmoj.setToken', async () => {
      const success = await authService.setToken() // Use validation method
      if (success) {
        // Refresh handled by onDidChangeLoginStatus listener in extension.ts
        // problemsetProvider.refresh();
        // submissionProvider.refresh();
        vscode.window.showInformationMessage('ACMOJ Token set successfully.')
      }
      // Error messages handled within authService.setTokenWithValidation
    }),

    vscode.commands.registerCommand('acmoj.clearToken', async () => {
      await authService.clearToken()
      // Refresh handled by onDidChangeLoginStatus listener in extension.ts
      // problemsetProvider.refresh();
      // submissionProvider.refresh();
      vscode.window.showInformationMessage('ACMOJ Token cleared.')
    }),

    vscode.commands.registerCommand('acmoj.showMyProfile', async () => {
      if (!authService.isLoggedIn()) {
        vscode.window.showWarningMessage('Not logged in to ACMOJ.')
        return
      }
      try {
        // Fetch latest profile info using UserService
        const profile = await userService.getUserProfile() // Use service
        if (profile) {
          vscode.window.showInformationMessage(
            `Logged in as: ${profile.friendly_name || profile.username} (${profile.username}), ID: ${profile.student_id || 'N/A'}`,
            { modal: false },
          )
        } else {
          // Should not happen if isLoggedIn is true, but handle defensively
          vscode.window.showWarningMessage(
            'Could not retrieve profile information.',
          )
        }
      } catch (error: any) {
        vscode.window.showErrorMessage(
          `Failed to fetch profile: ${error.message}`,
        )
      }
    }),
  )
}
