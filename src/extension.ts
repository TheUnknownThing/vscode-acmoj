import * as vscode from 'vscode'
import { AuthService } from './auth'
import { ApiClient } from './api'
import { ProblemsetProvider } from './views/problemsetProvider'
import { SubmissionProvider } from './views/submissionProvider'
import { registerCommands } from './commands'
import { Profile } from './types'

let authService: AuthService
let apiClient: ApiClient
let problemsetProvider: ProblemsetProvider
let submissionProvider: SubmissionProvider
let statusBarItem: vscode.StatusBarItem

export function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "vscode-acmoj" is now active!')

  authService = new AuthService(context)
  apiClient = new ApiClient(authService)

  problemsetProvider = new ProblemsetProvider(apiClient, authService)
  submissionProvider = new SubmissionProvider(apiClient, authService)

  vscode.window.registerTreeDataProvider('acmojProblemsets', problemsetProvider)
  vscode.window.registerTreeDataProvider('acmojSubmissions', submissionProvider)

  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  )
  statusBarItem.command = 'acmoj.showMyProfile'
  context.subscriptions.push(statusBarItem)

  authService.onDidChangeLoginStatus((loggedIn) => {
    updateStatusBar(loggedIn ? authService.getProfile() : null)
  })
  authService.onDidChangeProfile((profile) => {
    updateStatusBar(profile)
  })
  updateStatusBar(authService.getProfile())

  registerCommands(
    context,
    authService,
    apiClient,
    problemsetProvider,
    submissionProvider,
  )

  context.subscriptions.push(authService)

  if (authService.isLoggedIn()) {
    problemsetProvider.refresh()
    submissionProvider.refresh()
  }
}

function updateStatusBar(profile: Profile | null): void {
  if (profile) {
    statusBarItem.text = `$(account) ACMOJ: ${profile.friendly_name || profile.username}`
    statusBarItem.tooltip = `Logged in as ${profile.username} (${profile.student_id || 'No ID'})`
    statusBarItem.show()
  } else {
    statusBarItem.text = `$(sign-in) ACMOJ: Logged Out`
    statusBarItem.tooltip = `Click to set ACMOJ Personal Access Token`
    statusBarItem.command = 'acmoj.setToken' // Change command when logged out
    statusBarItem.show() // Keep it visible to allow setting token
  }
}

export function deactivate() {
  console.log('Your extension "vscode-acmoj" is now deactivated.')
  statusBarItem?.dispose() // Dispose status bar item
}
