import * as vscode from 'vscode'
import { ApiClient } from '../api'
import { SubmissionBrief, SubmissionStatus } from '../types'
import { AuthService } from '../auth'

// Union type for tree items
export type SubmissionViewItem = SubmissionTreeItem | NavigationTreeItem

export class SubmissionProvider
  implements vscode.TreeDataProvider<SubmissionViewItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    SubmissionViewItem | undefined | null | void
  > = new vscode.EventEmitter<SubmissionViewItem | undefined | null | void>()
  readonly onDidChangeTreeData: vscode.Event<
    SubmissionViewItem | undefined | null | void
  > = this._onDidChangeTreeData.event

  private currentCursor: string | undefined = undefined
  private previousCursors: string[] = []
  private hasNextPage: boolean = false
  private nextPageCursor: string | undefined = undefined // New variable to store the next page cursor

  constructor(
    private apiClient: ApiClient,
    private authService: AuthService,
  ) {
    authService.onDidChangeLoginStatus(() => this.refresh())
  }

  refresh(): void {
    this._onDidChangeTreeData.fire()
  }

  // Reset pagination to first page
  resetPagination(): void {
    this.currentCursor = undefined
    this.previousCursors = []
    this.hasNextPage = false
    this.refresh()
  }

  // Navigate to next page
  nextPage(): void {
    if (this.hasNextPage && this.nextPageCursor) {
      // Preserve the current cursor before moving to the next page
      if (!this.previousCursors.includes(this.currentCursor || '')) {
        this.previousCursors.push(this.currentCursor || '')
      }
      // Set the next page cursor as the current cursor
      this.currentCursor = this.nextPageCursor
      this.refresh()
    } else {
      vscode.window.showInformationMessage('No more pages available.')
    }
  }

  // Navigate to previous page
  previousPage(): void {
    if (this.previousCursors.length > 0) {
      this.currentCursor = this.previousCursors[this.previousCursors.length - 1]
      this.previousCursors.pop()
      this.refresh()
    } else {
      vscode.window.showInformationMessage('No previous pages available.')
      this.currentCursor = undefined
      this.previousCursors = []
    }
  }

  getTreeItem(element: SubmissionViewItem): vscode.TreeItem {
    return element
  }

  async getChildren(
    element?: SubmissionViewItem,
  ): Promise<SubmissionViewItem[]> {
    if (!this.authService.isLoggedIn()) {
      return [
        new SubmissionTreeItem(
          {} as SubmissionBrief,
          'Please login to view submissions',
        ),
      ]
    }

    if (element) {
      return []
    } else {
      try {
        // Get the current page of submissions
        const profile = await this.apiClient.getUserProfile()
        const username = profile.username

        // Acquire data from current cursor
        const { submissions, next } = await this.apiClient.getSubmissions(
          this.currentCursor,
          username,
        )

        // Parse the next page cursor, but do not update currentCursor here
        this.nextPageCursor = next
          ? new URLSearchParams(next).get('cursor') || undefined
          : undefined
        this.hasNextPage = Boolean(this.nextPageCursor)

        // No longer update currentCursor here.

        const result: SubmissionViewItem[] = submissions.map(
          (s) => new SubmissionTreeItem(s),
        )

        if (this.previousCursors.length > 0) {
          result.unshift(
            new NavigationTreeItem('Previous Page', 'previous-page'),
          )

          if (this.previousCursors.length > 1) {
            result.unshift(
              new NavigationTreeItem(
                'Back to First Page',
                'back-to-first-page',
              ),
            )
          }
        }

        if (this.hasNextPage) {
          result.push(new NavigationTreeItem('Next Page', 'next-page'))
        }

        return result
      } catch (error: any) {
        vscode.window.showErrorMessage(
          `Failed to load submissions: ${error.message}`,
        )
        return [
          new SubmissionTreeItem(
            {} as SubmissionBrief,
            `Error: ${error.message}`,
          ),
        ]
      }
    }
  }
}

// Navigation item for pagination
export class NavigationTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly navigationAction:
      | 'next-page'
      | 'previous-page'
      | 'back-to-first-page',
  ) {
    super(label, vscode.TreeItemCollapsibleState.None)

    let icon: vscode.ThemeIcon
    let commandId: string

    switch (navigationAction) {
      case 'next-page':
        icon = new vscode.ThemeIcon('arrow-right')
        commandId = 'acmoj.submissionNextPage'
        break
      case 'previous-page':
        icon = new vscode.ThemeIcon('arrow-left')
        commandId = 'acmoj.submissionPreviousPage'
        break
      case 'back-to-first-page':
        icon = new vscode.ThemeIcon('arrow-up')
        commandId = 'acmoj.submissionBackToFirstPage'
        break
    }

    this.iconPath = icon

    this.command = {
      command: commandId,
      title: label,
      arguments: [],
    }

    this.contextValue = 'navigation-item'
  }
}

export class SubmissionTreeItem extends vscode.TreeItem {
  constructor(
    public readonly submission: SubmissionBrief,
    errorMessage?: string,
  ) {
    if (errorMessage) {
      // For error messages or placeholders
      super(errorMessage, vscode.TreeItemCollapsibleState.None)
      return
    }

    const problemTitle =
      submission.problem?.title || `Problem ${submission.problem?.id || '?'}`
    const date = new Date(submission.created_at).toLocaleString()

    super(
      `#${submission.id} - ${problemTitle}`,
      vscode.TreeItemCollapsibleState.None,
    )

    this.description = `${submission.status} (${submission.language}) - ${date}`
    this.tooltip = `Submission ${submission.id}\nStatus: ${submission.status}\nLanguage: ${submission.language}\nTime: ${date}`

    this.id = `submission-${this.submission.id}`

    if (submission.id) {
      this.command = {
        command: 'acmoj.viewSubmission',
        title: 'View Submission Details',
        arguments: [submission.id],
      }
    }
    this.iconPath = SubmissionTreeItem.getIconForStatus(submission.status)
    this.contextValue = 'submission-item'
  }

  static getIconForStatus(status: SubmissionStatus): vscode.ThemeIcon {
    switch (status) {
      case 'accepted':
        return new vscode.ThemeIcon(
          'check',
          new vscode.ThemeColor('testing.iconPassed'),
        )
      case 'wrong_answer':
      case 'runtime_error':
      case 'bad_problem':
      case 'unknown_error':
      case 'system_error':
        return new vscode.ThemeIcon(
          'error',
          new vscode.ThemeColor('testing.iconFailed'),
        )
      case 'memory_leak':
        return new vscode.ThemeIcon(
          'error',
          new vscode.ThemeColor('testing.iconErrored'),
        )
      case 'compile_error':
        return new vscode.ThemeIcon(
          'warning',
          new vscode.ThemeColor('testing.iconErrored'),
        )
      case 'time_limit_exceeded':
      case 'memory_limit_exceeded':
      case 'disk_limit_exceeded':
        return new vscode.ThemeIcon(
          'clock',
          new vscode.ThemeColor('testing.iconSkipped'),
        )
      case 'pending':
      case 'compiling':
      case 'judging':
        return new vscode.ThemeIcon('sync~spin')
      case 'aborted':
      case 'void':
      case 'skipped':
        return new vscode.ThemeIcon(
          'circle-slash',
          new vscode.ThemeColor('testing.iconSkipped'),
        )
      default:
        return new vscode.ThemeIcon('question')
    }
  }
}
