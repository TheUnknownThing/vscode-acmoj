// src/commands/index.ts
import * as vscode from 'vscode'
import { AuthService } from '../core/auth'
import { ApiClient } from '../core/api'
import { CacheService } from '../services/cacheService'
import { ProblemService } from '../services/problemService'
import { SubmissionService } from '../services/submissionService'
import { ProblemsetService } from '../services/problemsetService'
import { UserService } from '../services/userService'
import { WorkspaceService } from '../services/workspaceService'
import { SubmissionMonitorService } from '../services/submissionMonitor'
import { ProblemsetProvider } from '../views/problemsetProvider'
import { SubmissionProvider } from '../views/submissionProvider'

// Import command handlers
import { registerAuthCommands } from './authCommands'
import { registerProblemCommands } from './problemCommands'
import { registerSubmissionCommands } from './submissionCommands'
import { registerFilterCommands } from './filterCommands' // For filters/pagination

export function registerCommands(
  context: vscode.ExtensionContext,
  authService: AuthService,
  cacheService: CacheService,
  apiClient: ApiClient,
  problemService: ProblemService,
  submissionService: SubmissionService,
  problemsetService: ProblemsetService,
  userService: UserService,
  workspaceService: WorkspaceService,
  submissionMonitor: SubmissionMonitorService,
  // Pass providers only if handlers absolutely need them
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
  registerProblemCommands(
    context,
    authService,
    problemService,
    workspaceService,
  )
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
