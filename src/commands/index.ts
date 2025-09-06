import * as vscode from 'vscode'
import { AuthService } from '../core/auth'
import { ApiClient } from '../core/api'
import { ProblemService } from '../services/problemService'
import { SubmissionService } from '../services/submissionService'
import { UserService } from '../services/userService'
import { WorkspaceService } from '../services/workspaceService'
import { SubmissionMonitorService } from '../services/submissionMonitorService'
import { ProblemsetProvider } from '../views/problemsetProvider'
import { SubmissionProvider } from '../views/submissionProvider'
import { OJMetadataService } from '../services/OJMetadataService'

// Import command handlers
import { registerAuthCommands } from './authCommands'
import { registerProblemCommands } from './problemCommands'
import { registerSubmissionCommands } from './submissionCommands'
import { registerFilterCommands } from './filterCommands'

export function registerCommands(
  context: vscode.ExtensionContext,
  authService: AuthService,
  apiClient: ApiClient,
  problemService: ProblemService,
  submissionService: SubmissionService,
  userService: UserService,
  workspaceService: WorkspaceService,
  submissionMonitor: SubmissionMonitorService,
  problemsetProvider: ProblemsetProvider,
  submissionProvider: SubmissionProvider,
  metadataService: OJMetadataService,
) {
  // Register commands from different modules
  registerAuthCommands(
    context,
    authService,
    userService,
    problemsetProvider,
    submissionProvider,
  )
  registerProblemCommands(context, authService, problemService, apiClient)
  registerSubmissionCommands(
    context,
    authService,
    submissionService,
    problemService,
    workspaceService,
    submissionMonitor,
    submissionProvider,
    metadataService,
  )
  registerFilterCommands(
    context,
    authService,
    submissionProvider,
    metadataService,
  ) // Pass provider for filters/pagination

  // Note: Refresh commands and clearCache are registered directly in extension.ts
}
