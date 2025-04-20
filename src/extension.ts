import * as vscode from 'vscode'
import { AuthService } from './core/auth'
import { ApiClient } from './core/api'
import { CacheService } from './services/cacheService'
import { ProblemService } from './services/problemService'
import { SubmissionService } from './services/submissionService'
import { ProblemsetService } from './services/problemsetService'
import { UserService } from './services/userService'
import { WorkspaceService } from './services/workspaceService'
import { ProblemsetProvider } from './views/problemsetProvider'
import { SubmissionProvider } from './views/submissionProvider'
import { registerCommands } from './commands'
import { SubmissionMonitorService } from './services/submissionMonitorService'
import { Profile } from './types'

let authService: AuthService
let cacheService: CacheService
let apiClient: ApiClient
let problemService: ProblemService
let submissionService: SubmissionService
let problemsetService: ProblemsetService
let userService: UserService
let workspaceService: WorkspaceService
let submissionMonitor: SubmissionMonitorService
let problemsetProvider: ProblemsetProvider
let submissionProvider: SubmissionProvider

let statusBarItem: vscode.StatusBarItem

export async function activate(context: vscode.ExtensionContext) {
  console.log('ACMOJ extension activating...')

  // --- Configuration ---
  const config = vscode.workspace.getConfiguration('acmoj')
  const cacheTtl = config.get<number>('cacheDefaultTtlMinutes', 15)

  // --- Service Instantiation (Order matters for dependencies) ---
  authService = new AuthService(context)
  cacheService = new CacheService(cacheTtl)
  apiClient = new ApiClient(authService)
  problemService = new ProblemService(apiClient)
  submissionService = new SubmissionService(apiClient)
  problemsetService = new ProblemsetService(apiClient)
  userService = new UserService(apiClient)
  workspaceService = new WorkspaceService()
  submissionMonitor = new SubmissionMonitorService(
    cacheService,
    submissionService,
    submissionProvider,
  )

  context.subscriptions.push(authService) // Ensure authService is disposed if needed
  context.subscriptions.push({ dispose: () => cacheService.dispose() }) // Dispose cache

  // --- View Provider Registration ---
  problemsetProvider = new ProblemsetProvider(problemsetService, authService)
  submissionProvider = new SubmissionProvider(submissionService, authService)

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider(
      'acmojProblemsets',
      problemsetProvider,
    ),
    vscode.window.registerTreeDataProvider(
      'acmojSubmissions',
      submissionProvider,
    ),
  )

  // --- Status Bar ---
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  )
  statusBarItem.command = 'acmoj.showMyProfile' // Default command
  context.subscriptions.push(statusBarItem)
  updateStatusBar(await authService.getProfile()) // Initial status bar update

  // Listen to login status changes
  authService.onDidChangeLoginStatus(async (loggedIn) => {
    updateStatusBar(loggedIn ? await authService.getProfile() : null)
    vscode.commands.executeCommand('setContext', 'acmoj.loggedIn', loggedIn)
    // Refresh views on login/logout
    if (loggedIn) {
      problemsetProvider.refresh()
      submissionProvider.refresh()
    } else {
      // Clear views or show logged-out state
      problemsetProvider.refresh()
      submissionProvider.refresh()
    }
  })

  // --- Register Commands ---
  registerCommands(
    context,
    authService,
    problemService,
    submissionService,
    userService,
    workspaceService,
    submissionMonitor,
    problemsetProvider,
    submissionProvider,
  )

  // --- Register Dedicated Refresh Commands (Simpler than passing providers everywhere) ---
  context.subscriptions.push(
    vscode.commands.registerCommand('acmoj.refreshProblemset', () => {
      if (!authService.isLoggedIn()) {
        vscode.window.showWarningMessage('Please login to ACMOJ first.')
        return
      }
      problemsetProvider.refresh()
    }),
    vscode.commands.registerCommand('acmoj.refreshSubmissions', () => {
      if (!authService.isLoggedIn()) {
        vscode.window.showWarningMessage('Please login to ACMOJ first.')
        return
      }
      submissionProvider.refresh()
    }),
    vscode.commands.registerCommand('acmoj.clearCache', async () => {
      const confirmation = await vscode.window.showWarningMessage(
        'Are you sure you want to clear all cached API data?',
        { modal: true },
        'Confirm',
        'Cancel',
      )
      if (confirmation === 'Confirm') {
        cacheService.clear() // Use CacheService to clear all
        vscode.window.showInformationMessage('ACMOJ cache cleared.')
        // Refresh views
        problemsetProvider.refresh()
        submissionProvider.refresh()
      }
    }),
  )

  // --- Set Initial Context ---
  vscode.commands.executeCommand(
    'setContext',
    'acmoj.loggedIn',
    authService.isLoggedIn(),
  )

  // --- Initial Activation Actions ---
  if (authService.isLoggedIn()) {
    updateStatusBar(await authService.getProfile())
  } else {
    updateStatusBar(null) // Ensure status bar shows logged out
  }

  console.log('ACMOJ extension activated successfully.')
}

function updateStatusBar(profile: Profile | null): void {
  if (profile) {
    statusBarItem.text = `$(account) ACMOJ: ${profile.friendly_name || profile.username}`
    statusBarItem.tooltip = `Logged in as ${profile.username} (${profile.student_id || 'No ID'}) - Click for details`
    statusBarItem.command = 'acmoj.showMyProfile'
    statusBarItem.show()
  } else {
    statusBarItem.text = `$(sign-in) ACMOJ: Logged Out`
    statusBarItem.tooltip = `Click to set ACMOJ Personal Access Token`
    statusBarItem.command = 'acmoj.setToken' // Change command when logged out
    statusBarItem.show()
  }
}

export function deactivate() {
  console.log('ACMOJ extension deactivating...')
  // VS Code handles disposal of subscriptions added to context.subscriptions
  // Explicitly dispose things not in subscriptions if necessary
  statusBarItem?.dispose()
}
