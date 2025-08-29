import * as vscode from 'vscode'
import { AuthService } from '../core/auth'
import { SubmissionProvider } from '../views/submissionProvider'
import { OJMetadataService } from '../services/OJMetadataService'
import { JudgeStatusInfo, LanguageInfo } from '../types'

export function registerFilterCommands(
  context: vscode.ExtensionContext,
  authService: AuthService,
  submissionProvider: SubmissionProvider, // Inject provider directly
  metadataService: OJMetadataService,
) {
  // --- Direct Filter Setters ---
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'acmoj.setStatusFilter',
      (value?: string) => {
        if (!authService.isLoggedIn()) return // Quick check
        submissionProvider.setStatusFilter(value)
      },
    ),
    vscode.commands.registerCommand(
      'acmoj.setLanguageFilter',
      (value?: string) => {
        if (!authService.isLoggedIn()) return
        submissionProvider.setLanguageFilter(value)
      },
    ),
    vscode.commands.registerCommand(
      'acmoj.setProblemIdFilter',
      (value?: number) => {
        if (!authService.isLoggedIn()) return
        submissionProvider.setProblemIdFilter(value)
      },
    ),

    // --- Interactive Filter Setters ---
    vscode.commands.registerCommand(
      'acmoj.setCustomProblemIdFilter',
      async () => {
        if (!(await authService.checkLoginAndPrompt)) return
        const problemId = await vscode.window.showInputBox({
          placeHolder: 'Enter problem ID (leave blank for All)',
          validateInput: (value) => {
            if (value && !/^\d+$/.test(value))
              return 'Please enter a valid number'
            return null
          },
          ignoreFocusOut: true,
        })
        // Allow cancelling (undefined) or clearing (empty string)
        if (problemId !== undefined) {
          submissionProvider.setProblemIdFilter(
            problemId ? parseInt(problemId) : undefined,
          )
        }
      },
    ),

    vscode.commands.registerCommand('acmoj.clearAllFilters', () => {
      if (!authService.isLoggedIn()) return
      submissionProvider.clearFilters() // Add a clearFilters method to provider
      vscode.window.showInformationMessage('All submission filters cleared.')
    }),

    // --- Pagination ---
    vscode.commands.registerCommand('acmoj.submissionNextPage', () => {
      if (!authService.isLoggedIn()) return
      submissionProvider.nextPage()
    }),
    vscode.commands.registerCommand('acmoj.submissionPreviousPage', () => {
      if (!authService.isLoggedIn()) return
      submissionProvider.previousPage()
    }),
    vscode.commands.registerCommand('acmoj.submissionBackToFirstPage', () => {
      if (!authService.isLoggedIn()) return
      submissionProvider.resetPagination()
    }),

    // --- Manage Filters Command ---
    vscode.commands.registerCommand(
      'acmoj.manageSubmissionFilters',
      async (filterType) => {
        if (!authService.isLoggedIn()) {
          vscode.window.showWarningMessage('Please login to ACMOJ first.')
          return
        }

        if (!filterType) {
          const options = [
            'Status',
            'Problem ID',
            'Language',
            'Clear All Filters',
          ]
          const selection = await vscode.window.showQuickPick(options, {
            placeHolder: 'Select filter to manage',
          })

          if (!selection) return

          if (selection === 'Clear All Filters') {
            vscode.commands.executeCommand('acmoj.clearAllFilters')
            return
          } else if (selection === 'Status') {
            filterType = 'status'
          } else if (selection === 'Problem ID') {
            filterType = 'problemId'
          } else if (selection === 'Language') {
            filterType = 'language'
          }
        }

        switch (filterType) {
          case 'status': {
            // Fallback list
            let statusEntries: Array<{ key: string; label: string }> = [
              { key: 'accepted', label: 'Accepted' },
              { key: 'wrong_answer', label: 'Wrong Answer' },
              { key: 'compile_error', label: 'Compile Error' },
              { key: 'time_limit_exceeded', label: 'Time Limit Exceeded' },
              { key: 'memory_limit_exceeded', label: 'Memory Limit Exceeded' },
              { key: 'memory_leak', label: 'Memory Leak' },
              { key: 'disk_limit_exceeded', label: 'Disk Limit Exceeded' },
              { key: 'runtime_error', label: 'Runtime Error' },
              { key: 'pending', label: 'Pending' },
              { key: 'judging', label: 'Judging' },
            ]
            try {
              const info: JudgeStatusInfo =
                await metadataService.getJudgeStatusInfo()
              statusEntries = Object.entries(info).map(([k, v]) => ({
                key: k,
                label: v.name || k,
              }))
            } catch (_) {
              // ignore, fallback is used
            }
            const statusSelection = await vscode.window.showQuickPick(
              ['All', ...statusEntries.map((o) => o.label)],
              { placeHolder: 'Select status filter' },
            )
            if (statusSelection !== undefined) {
              if (statusSelection === 'All') {
                vscode.commands.executeCommand(
                  'acmoj.setStatusFilter',
                  undefined,
                )
              } else {
                const selected = statusEntries.find(
                  (o) => o.label === statusSelection,
                )
                vscode.commands.executeCommand(
                  'acmoj.setStatusFilter',
                  selected?.key,
                )
              }
            }
            break
          }

          case 'problemId': {
            vscode.commands.executeCommand('acmoj.setCustomProblemIdFilter')
            break
          }

          case 'language': {
            let languageEntries: Array<{ key: string; label: string }> = [
              { key: 'cpp', label: 'C++' },
              { key: 'python', label: 'Python' },
              { key: 'git', label: 'Git' },
              { key: 'verilog', label: 'Verilog' },
            ]
            try {
              const info: LanguageInfo = await metadataService.getLanguageInfo()
              languageEntries = Object.entries(info).map(([k, v]) => ({
                key: k,
                label: v.name || k,
              }))
            } catch (_) {
              // ignore
            }
            const langSelection = await vscode.window.showQuickPick(
              ['All', ...languageEntries.map((o) => o.label)],
              { placeHolder: 'Select language filter' },
            )
            if (langSelection !== undefined) {
              if (langSelection === 'All') {
                vscode.commands.executeCommand(
                  'acmoj.setLanguageFilter',
                  undefined,
                )
              } else {
                const selected = languageEntries.find(
                  (o) => o.label === langSelection,
                )
                vscode.commands.executeCommand(
                  'acmoj.setLanguageFilter',
                  selected?.key,
                )
              }
            }
            break
          }
        }
      },
    ),
  )
}
