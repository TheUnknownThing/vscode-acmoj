// src/extension.ts
import * as vscode from 'vscode'
import { AuthService } from './core/auth'
import { ApiClient } from './core/api'
import { CacheService } from './services/cacheService'
import { ProblemService } from './services/problemService'
import { SubmissionService } from './services/submissionService'
import { ProblemsetService } from './services/problemsetService'
import { UserService } from './services/userService'
import { WorkspaceService } from './services/workspaceService' // NEW: For workspace interactions
import { ProblemsetProvider } from './views/problemsetProvider'
import { SubmissionProvider } from './views/submissionProvider'
import { registerCommands } from './commands' // Will point to src/commands/index.ts
import { SubmissionMonitorService } from './services/submissionMonitor' // Keep this service
import { Profile } from './types'

// Make services accessible globally within the extension if needed,
// though dependency injection is preferred.
// Consider creating a central 'ServiceContainer' if this gets complex.
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
  authService = new AuthService(context) // Use constructor DI
  cacheService = new CacheService(cacheTtl)
  apiClient = new ApiClient(authService, context) // Pass authService and context
  problemService = new ProblemService(apiClient, cacheService)
  submissionService = new SubmissionService(apiClient, cacheService)
  problemsetService = new ProblemsetService(apiClient, cacheService)
  userService = new UserService(apiClient, cacheService)
  workspaceService = new WorkspaceService() // Instantiate WorkspaceService
  // SubmissionMonitor needs SubmissionService now
  submissionMonitor = new SubmissionMonitorService(submissionService) // Pass SubmissionService

  context.subscriptions.push(authService) // Ensure authService is disposed if needed
  context.subscriptions.push({ dispose: () => cacheService.dispose() }) // Dispose cache

  // --- View Provider Registration ---
  // Inject only the services they *need*
  problemsetProvider = new ProblemsetProvider(
    problemService,
    problemsetService,
    authService,
  )
  submissionProvider = new SubmissionProvider(
    submissionService,
    userService,
    authService,
  ) // Pass needed services

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
      problemsetProvider.refresh() // Will likely show nothing or a login message
      submissionProvider.refresh() // Will likely show nothing or a login message
    }
  })
  // Optional: Listen to profile changes if friendly_name can change without logout/login
  // authService.onDidChangeProfile((profile) => updateStatusBar(profile));

  // --- Register Commands ---
  // Pass all services needed by *any* command. Command handlers will pick what they need.
  // Pass context for extensionUri access in panels.
  registerCommands(
    context,
    authService,
    cacheService,
    apiClient, // Keep apiClient for base URL or direct calls if necessary
    problemService,
    submissionService,
    problemsetService,
    userService,
    workspaceService, // Pass WorkspaceService
    submissionMonitor,
    // Pass providers ONLY if commands *absolutely* need direct manipulation
    // Prefer triggering provider refresh via dedicated commands or events
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
    // Fetch profile on activation if logged in, to ensure status bar is accurate
    authService.getProfile().then((profile) => updateStatusBar(profile))
    // Initial refresh can be triggered here or rely on view visibility change
    // problemsetProvider.refresh();
    // submissionProvider.refresh();
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
