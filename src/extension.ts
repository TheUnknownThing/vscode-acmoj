import * as vscode from 'vscode'
import { AuthService } from './auth'
import { ApiClient } from './api'
import { ProblemsetProvider } from './views/problemsetProvider'
import { SubmissionProvider } from './views/submissionProvider'
import { registerCommands } from './commands'
import { SubmissionMonitorService } from './submissionMonitor'
import { Profile } from './types'

let authService: AuthService
let apiClient: ApiClient
let problemsetProvider: ProblemsetProvider
let submissionProvider: SubmissionProvider
let submissionMonitor: SubmissionMonitorService
let statusBarItem: vscode.StatusBarItem

export async function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "vscode-acmoj" is now active!')

  authService = new AuthService(context)
  apiClient = new ApiClient(authService)

  problemsetProvider = new ProblemsetProvider(apiClient, authService)
  submissionProvider = new SubmissionProvider(apiClient, authService)

  // Create submission monitoring service
  submissionMonitor = new SubmissionMonitorService(
    apiClient,
    submissionProvider,
  )

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
    vscode.commands.executeCommand('setContext', 'acmoj.loggedIn', loggedIn)
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
    submissionMonitor,
  )

  context.subscriptions.push(authService)

  vscode.commands.executeCommand(
    'setContext',
    'acmoj.loggedIn',
    authService.isLoggedIn(),
  )

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
