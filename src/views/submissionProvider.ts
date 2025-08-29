import * as vscode from 'vscode'
import {
  SubmissionBrief,
  SubmissionStatus,
  JudgeStatusInfo,
  LanguageInfo,
} from '../types'
import { OJMetadataService } from '../services/OJMetadataService'
import { AuthService } from '../core/auth'
import { SubmissionService } from '../services/submissionService'

// Union type for tree items
export type SubmissionViewItem =
  | SubmissionTreeItem
  | NavigationTreeItem
  | FilterCategoryTreeItem
  | FilterOptionTreeItem
  | FilterGroupTreeItem
  | FilterButtonItem
  | FilterItemTreeItem
  | ClearFiltersTreeItem

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
  private nextPageCursor: string | undefined = undefined

  // Filter state
  private statusFilter: string | undefined = undefined
  private problemIdFilter: number | undefined = undefined
  private languageFilter: string | undefined = undefined

  constructor(
    private submissionService: SubmissionService,
    private authService: AuthService,
    private metadataService: OJMetadataService,
  ) {
    authService.onDidChangeLoginStatus(() => this.refresh())
  }

  refresh(): void {
    this.submissionService.clearAllSubmissionCaches()
    this._onDidChangeTreeData.fire()
  }

  // Reset pagination to first page
  resetPagination(): void {
    this.currentCursor = undefined
    this.previousCursors = []
    this.hasNextPage = false
    this.refresh()
  }

  setStatusFilter(status: string | undefined): void {
    this.statusFilter = status
    this.resetPagination()
  }

  clearFilters(): void {
    this.statusFilter = undefined
    this.problemIdFilter = undefined
    this.languageFilter = undefined
    this.resetPagination()
  }

  setProblemIdFilter(problemId: number | undefined): void {
    this.problemIdFilter = problemId
    this.resetPagination()
  }

  setLanguageFilter(language: string | undefined): void {
    this.languageFilter = language
    this.resetPagination()
  }

  nextPage(): void {
    if (this.hasNextPage && this.nextPageCursor) {
      if (!this.previousCursors.includes(this.currentCursor || '')) {
        this.previousCursors.push(this.currentCursor || '')
      }
      this.currentCursor = this.nextPageCursor
      this.refresh()
    } else {
      vscode.window.showInformationMessage('No more pages available.')
    }
  }

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

    // If this is the filter group, return filter categories
    if (element instanceof FilterGroupTreeItem) {
      return [
        new FilterCategoryTreeItem('Status', 'status', this.statusFilter),
        new FilterCategoryTreeItem(
          'Problem ID',
          'problemId',
          this.problemIdFilter?.toString(),
        ),
        new FilterCategoryTreeItem('Language', 'language', this.languageFilter),
      ]
    }

    // If this is a filter category, return filter options
    if (element instanceof FilterCategoryTreeItem) {
      return this.getFilterOptions(element.filterType)
    }

    // If there is a parent element but not a filter category, return an empty array
    if (element) {
      return []
    }

    // Root level display - top-level nodes
    try {
      const result: SubmissionViewItem[] = []

      // Add individual filter items to display current filter states
      result.push(
        new FilterItemTreeItem('Status', this.statusFilter || 'All', 'status'),
      )
      result.push(
        new FilterItemTreeItem(
          'Problem',
          this.problemIdFilter ? `ID: ${this.problemIdFilter}` : 'All',
          'problemId',
        ),
      )
      result.push(
        new FilterItemTreeItem(
          'Language',
          this.languageFilter || 'All',
          'language',
        ),
      )

      // Add an option to clear all filters
      if (this.hasActiveFilters()) {
        result.push(new ClearFiltersTreeItem())
      }

      // Get the current page of submissions with filters applied
      const profile = await this.authService.getProfile()
      const username = (profile && profile.username) || undefined

      const { submissions, next } = await this.submissionService.getSubmissions(
        this.currentCursor,
        username,
        this.problemIdFilter,
        this.statusFilter,
        this.languageFilter,
      )

      for (const submission of submissions) {
        if (
          submission.status === 'pending' ||
          submission.status === 'compiling' ||
          submission.status === 'judging'
        ) {
          this.submissionService.clearSubmissionDetailCache(submission.id)
        }
      }

      this.nextPageCursor = next
        ? new URLSearchParams(next).get('cursor') || undefined
        : undefined
      this.hasNextPage = Boolean(this.nextPageCursor)

      // Add submission items directly as top-level nodes
      result.push(...submissions.map((s) => new SubmissionTreeItem(s)))

      // Add navigation items at the bottom
      if (this.previousCursors.length > 0 || this.hasNextPage) {
        const navigationItems: NavigationTreeItem[] = []

        if (this.hasNextPage) {
          navigationItems.push(new NavigationTreeItem('Next Page', 'next-page'))
        }

        if (this.previousCursors.length > 0) {
          navigationItems.push(
            new NavigationTreeItem('Previous Page', 'previous-page'),
          )

          if (this.previousCursors.length > 1) {
            navigationItems.push(
              new NavigationTreeItem(
                'Back to First Page',
                'back-to-first-page',
              ),
            )
          }
        }

        result.push(...navigationItems)
      }

      return result
    } catch (error: unknown) {
      let message = 'Unknown error'
      if (error instanceof Error) {
        message = error.message
      }
      vscode.window.showErrorMessage(`Failed to load submissions: ${message}`)
      return [
        new SubmissionTreeItem({} as SubmissionBrief, `Error: ${message}`),
      ]
    }
  }

  private hasActiveFilters(): boolean {
    return (
      this.statusFilter !== undefined ||
      this.problemIdFilter !== undefined ||
      this.languageFilter !== undefined
    )
  }

  private getFilterOptions(filterType: string): SubmissionViewItem[] {
    if (filterType === 'status') {
      let statusEntries: Array<{ key: string; label: string }> = []
      try {
        // We cannot await here; metadata service caches internally but requires async.
        // Instead, schedule refresh if not loaded.
        statusEntries = [
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
        // Fire async fetch
        this.metadataService
          .getJudgeStatusInfo()
          .then((info: JudgeStatusInfo) => {
            const dynamic = Object.entries(info).map(([key, detail]) => ({
              key,
              label: detail.name || key,
            }))
            // Only refresh if changed size (avoid loops)
            if (dynamic.length !== statusEntries.length) {
              this._onDidChangeTreeData.fire()
            }
            statusEntries = dynamic
          })
          .catch(() => {})
      } catch (_) {
        // ignore
      }
      const items = [
        new FilterOptionTreeItem(
          'All',
          'status',
          undefined,
          this.statusFilter === undefined,
        ),
        ...statusEntries.map(
          (s) =>
            new FilterOptionTreeItem(
              s.label,
              'status',
              s.key,
              this.statusFilter === s.key,
            ),
        ),
      ]
      return items
    } else if (filterType === 'problemId') {
      const options: { label: string; value: undefined | number | 'custom' }[] =
        [{ label: 'All Problems', value: undefined }]

      // If there's a current problem ID filter, add it to the options
      if (this.problemIdFilter !== undefined) {
        options.push({
          label: `Problem ${this.problemIdFilter}`,
          value: this.problemIdFilter,
        })
      }

      // Add option to set custom problem ID
      options.push({ label: 'Set Custom Problem ID...', value: 'custom' })

      return options.map(
        (option) =>
          new FilterOptionTreeItem(
            option.label,
            'problemId',
            option.value,
            this.problemIdFilter === option.value,
          ),
      )
    } else if (filterType === 'language') {
      let languageEntries: Array<{ key: string; label: string }> = []
      try {
        languageEntries = [
          { key: 'cpp', label: 'C++' },
          { key: 'python', label: 'Python' },
          { key: 'git', label: 'Git' },
          { key: 'verilog', label: 'Verilog' },
        ]
        this.metadataService
          .getLanguageInfo()
          .then((info: LanguageInfo) => {
            const dynamic = Object.entries(info).map(([key, detail]) => ({
              key,
              label: detail.name || key,
            }))
            if (dynamic.length !== languageEntries.length) {
              this._onDidChangeTreeData.fire()
            }
            languageEntries = dynamic
          })
          .catch(() => {})
      } catch (_) {
        // ignore metadata fetch error, fallback already in place
      }
      return [
        new FilterOptionTreeItem(
          'All',
          'language',
          undefined,
          this.languageFilter === undefined,
        ),
        ...languageEntries.map(
          (l) =>
            new FilterOptionTreeItem(
              l.label,
              'language',
              l.key,
              this.languageFilter === l.key,
            ),
        ),
      ]
    }

    return []
  }
}

// Filter group item
export class FilterGroupTreeItem extends vscode.TreeItem {
  constructor(hasActiveFilters: boolean, hidden: boolean = false) {
    super(
      'Filters',
      hasActiveFilters
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed,
    )

    this.iconPath = new vscode.ThemeIcon('filter')
    this.contextValue = 'filter-group'

    // Show a badge if filters are active
    if (hasActiveFilters) {
      this.description = 'Active'
      this.iconPath = new vscode.ThemeIcon('filter-filled')
    }

    // Hide this item (used for internal navigation)
    if (hidden) {
      this.collapsibleState = vscode.TreeItemCollapsibleState.None
      this.description = undefined
    }
  }
}

// Filter button item
export class FilterButtonItem extends vscode.TreeItem {
  constructor(hasActiveFilters: boolean) {
    super(
      hasActiveFilters ? 'Filters (Active)' : 'Filters',
      vscode.TreeItemCollapsibleState.None,
    )

    this.iconPath = hasActiveFilters
      ? new vscode.ThemeIcon('filter-filled')
      : new vscode.ThemeIcon('filter')

    this.tooltip = 'Click to manage filters'
    this.command = {
      command: 'acmoj.manageSubmissionFilters',
      title: 'Manage Submission Filters',
      arguments: [],
    }

    this.contextValue = 'filter-button'
  }
}

// Filter category item
export class FilterCategoryTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly filterType: string,
    currentValue?: string,
  ) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed)

    this.description = currentValue
      ? filterType === 'status'
        ? currentValue
        : `ID: ${currentValue}`
      : 'All'

    this.iconPath = new vscode.ThemeIcon('filter')
    this.contextValue = 'filter-category'
  }
}

// Filter option item
export class FilterOptionTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly filterType: string,
    public readonly value: unknown,
    isSelected: boolean,
  ) {
    super(label, vscode.TreeItemCollapsibleState.None)

    if (filterType === 'problemId' && value === 'custom') {
      this.command = {
        command: 'acmoj.setCustomProblemIdFilter',
        title: 'Set Custom Problem ID',
        arguments: [],
      }
    } else {
      this.command = {
        command: `acmoj.set${filterType.charAt(0).toUpperCase() + filterType.slice(1)}Filter`,
        title: `Set ${filterType} Filter`,
        arguments: [this.value],
      }
    }

    if (isSelected) {
      this.iconPath = new vscode.ThemeIcon('check')
    }

    this.contextValue = 'filter-option'
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

// Filter item for displaying current filter states
export class FilterItemTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    value: string,
    public readonly filterType: string,
  ) {
    super(`${label}: ${value}`, vscode.TreeItemCollapsibleState.None)

    this.iconPath = new vscode.ThemeIcon('filter')
    this.contextValue = 'filter-item'

    // Set click command based on filter type
    if (filterType === 'problemId') {
      this.command = {
        command: 'acmoj.setCustomProblemIdFilter',
        title: 'Set Problem ID Filter',
        arguments: [],
      }
    } else {
      this.command = {
        command: 'acmoj.manageSubmissionFilters',
        title: `Manage Filters`,
        arguments: [filterType],
      }
    }
  }
}

// Clear all filters button
export class ClearFiltersTreeItem extends vscode.TreeItem {
  constructor() {
    super('Clear All Filters', vscode.TreeItemCollapsibleState.None)

    this.iconPath = new vscode.ThemeIcon('clear-all')
    this.contextValue = 'clear-filters'
    this.command = {
      command: 'acmoj.clearAllFilters',
      title: 'Clear All Filters',
      arguments: [],
    }
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
