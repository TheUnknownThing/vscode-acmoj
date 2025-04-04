// src/commands/filterCommands.ts
import * as vscode from 'vscode'
import { AuthService } from '../core/auth'
import { SubmissionProvider } from '../views/submissionProvider'

// Helper function for login check
async function checkLoginAndPrompt(authService: AuthService): Promise<boolean> {
  // ... (same implementation as in other command files) ...
  if (!authService.isLoggedIn()) {
    const selection = await vscode.window.showWarningMessage(
      'Please set your ACMOJ Personal Access Token first.',
      'Set Token',
      'Cancel',
    )
    if (selection === 'Set Token') {
      await vscode.commands.executeCommand('acmoj.setToken')
      return authService.isLoggedIn()
    }
    return false
  }
  return true
}

export function registerFilterCommands(
  context: vscode.ExtensionContext,
  authService: AuthService,
  submissionProvider: SubmissionProvider, // Inject provider directly
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
        if (!(await checkLoginAndPrompt(authService))) return
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
          case 'status':
            const statusOptions = [
              { label: 'All', value: undefined },
              { label: 'Accepted', value: 'accepted' },
              { label: 'Wrong Answer', value: 'wrong_answer' },
              { label: 'Compile Error', value: 'compile_error' },
              { label: 'Time Limit Exceeded', value: 'time_limit_exceeded' },
              {
                label: 'Memory Limit Exceeded',
                value: 'memory_limit_exceeded',
              },
              { label: 'Memory Leak', value: 'memory_leak' },
              { label: 'Disk Limit Exceeded', value: 'disk_limit_exceeded' },
              { label: 'Runtime Error', value: 'runtime_error' },
              { label: 'Pending', value: 'pending' },
              { label: 'Judging', value: 'judging' },
            ]

            const statusSelection = await vscode.window.showQuickPick(
              statusOptions.map((o) => o.label),
              { placeHolder: 'Select status filter' },
            )

            if (statusSelection) {
              const selectedOption = statusOptions.find(
                (o) => o.label === statusSelection,
              )
              vscode.commands.executeCommand(
                'acmoj.setStatusFilter',
                selectedOption?.value,
              )
            }
            break

          case 'problemId':
            vscode.commands.executeCommand('acmoj.setCustomProblemIdFilter')
            break

          case 'language':
            const languageOptions = [
              { label: 'All', value: undefined },
              { label: 'C++', value: 'cpp' },
              { label: 'Python', value: 'python' },
              { label: 'Git', value: 'git' },
              { label: 'Verilog', value: 'verilog' },
            ]

            const langSelection = await vscode.window.showQuickPick(
              languageOptions.map((o) => o.label),
              { placeHolder: 'Select language filter' },
            )

            if (langSelection) {
              const selectedOption = languageOptions.find(
                (o) => o.label === langSelection,
              )
              vscode.commands.executeCommand(
                'acmoj.setLanguageFilter',
                selectedOption?.value,
              )
            }
            break
        }
      },
    ),
  )
}
