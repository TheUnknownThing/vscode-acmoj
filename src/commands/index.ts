import * as vscode from 'vscode'
import { AuthService } from '../core/auth'
import { ProblemService } from '../services/problemService'
import { SubmissionService } from '../services/submissionService'
import { UserService } from '../services/userService'
import { WorkspaceService } from '../services/workspaceService'
import { SubmissionMonitorService } from '../services/submissionMonitorService'
import { ProblemsetProvider } from '../views/problemsetProvider'
import { SubmissionProvider } from '../views/submissionProvider'

// Import command handlers
import { registerAuthCommands } from './authCommands'
import { registerProblemCommands } from './problemCommands'
import { registerSubmissionCommands } from './submissionCommands'
import { registerFilterCommands } from './filterCommands'

export function registerCommands(
  context: vscode.ExtensionContext,
  authService: AuthService,
  problemService: ProblemService,
  submissionService: SubmissionService,
  userService: UserService,
  workspaceService: WorkspaceService,
  submissionMonitor: SubmissionMonitorService,
  problemsetProvider: ProblemsetProvider,
  submissionProvider: SubmissionProvider,
) {
  // Register commands from different modules
  registerAuthCommands(
    context,
    authService,
    userService,
    problemsetProvider,
    submissionProvider,
  )
  registerProblemCommands(context, authService, problemService)
  registerSubmissionCommands(
    context,
    authService,
    submissionService,
    problemService,
    workspaceService,
    submissionMonitor,
    submissionProvider,
  )
  registerFilterCommands(context, authService, submissionProvider) // Pass provider for filters/pagination

  // Note: Refresh commands and clearCache are registered directly in extension.ts
}
