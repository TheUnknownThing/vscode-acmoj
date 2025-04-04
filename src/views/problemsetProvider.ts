import * as vscode from 'vscode'
import { Problemset, ProblemBrief } from '../types'
import { AuthService } from '../core/auth'
import { ProblemsetService } from '../services/problemsetService'

type AcmojTreeItem =
  | CategoryTreeItem
  | ProblemsetTreeItem
  | ProblemBriefTreeItem
  | vscode.TreeItem

export class ProblemsetProvider
  implements vscode.TreeDataProvider<AcmojTreeItem>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    AcmojTreeItem | undefined | null | void
  > = new vscode.EventEmitter<AcmojTreeItem | undefined | null | void>()
  readonly onDidChangeTreeData: vscode.Event<
    AcmojTreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event

  private allProblemsets: Problemset[] | null = null
  private problemsetCache: Map<number, Problemset> = new Map() // Keep cache for details

  constructor(
    private problemsetService: ProblemsetService,
    private authService: AuthService,
  ) {
    authService.onDidChangeLoginStatus(() => this.refresh())
  }

  refresh(): void {
    this.allProblemsets = null // Clear the full list cache
    this.problemsetCache.clear() // Clear details cache
    this._onDidChangeTreeData.fire()
  }

  getTreeItem(element: AcmojTreeItem): vscode.TreeItem {
    return element
  }

  async getChildren(element?: AcmojTreeItem): Promise<AcmojTreeItem[]> {
    if (!this.authService.isLoggedIn()) {
      return [
        new vscode.TreeItem(
          'Please set token to view problemsets',
          vscode.TreeItemCollapsibleState.None,
        ),
      ]
    }

    // Root level: Return the categories
    if (!element) {
      // Fetch all problemsets if not already fetched in this cycle
      if (this.allProblemsets === null) {
        try {
          const { problemsets } = await this.problemsetService.getUserProblemsets()
          this.allProblemsets = problemsets
        } catch (error: any) {
          vscode.window.showErrorMessage(
            `Failed to load problemsets: ${error.message}`,
          )
          this.allProblemsets = [] // Avoid retrying on error within the same cycle
          return [
            new vscode.TreeItem(
              `Error loading problemsets: ${error.message}`,
              vscode.TreeItemCollapsibleState.None,
            ),
          ]
        }
      }
      // Return the static category nodes
      return [
        new CategoryTreeItem('Ongoing', 'ongoing'),
        new CategoryTreeItem('Upcoming', 'upcoming'),
        new CategoryTreeItem('Passed', 'passed'),
      ]
    }

    // Category level: Return problemsets belonging to this category
    if (element instanceof CategoryTreeItem) {
      if (this.allProblemsets === null) {
        console.warn(
          'Problemsets not loaded when expanding category, fetching again.',
        )
        try {
          const { problemsets } = await this.problemsetService.getUserProblemsets()
          this.allProblemsets = problemsets
        } catch (error: any) {
          return [
            new vscode.TreeItem(
              `Error loading problemsets: ${error.message}`,
              vscode.TreeItemCollapsibleState.None,
            ),
          ]
        }
      }

      const now = new Date()
      const categoryProblemsets = this.allProblemsets.filter((ps) => {
        try {
          const startTime = new Date(ps.start_time)
          const endTime = new Date(ps.end_time)

          switch (element.categoryType) {
            case 'ongoing':
              return now >= startTime && now < endTime
            case 'upcoming':
              return now < startTime
            case 'passed':
              return now >= endTime
            default:
              return false
          }
        } catch (e) {
          console.error(`Error parsing dates for problemset ${ps.id}:`, e)
          return false // Exclude if dates are invalid
        }
      })

      // Sort within category
      categoryProblemsets.sort((a, b) => {
        try {
          const startTimeA = new Date(a.start_time).getTime()
          const endTimeA = new Date(a.end_time).getTime()
          const startTimeB = new Date(b.start_time).getTime()
          const endTimeB = new Date(b.end_time).getTime()

          switch (element.categoryType) {
            case 'ongoing':
              return endTimeA - endTimeB // Closest deadline first
            case 'upcoming':
              return startTimeA - startTimeB // Starting soonest first
            case 'passed':
              return endTimeB - endTimeA // Ended most recently first
            default:
              return 0
          }
        } catch {
          return 0
        } // Handle errors in date parsing gracefully
      })

      if (categoryProblemsets.length === 0) {
        return [
          new vscode.TreeItem(
            `No ${element.categoryType} problemsets found.`,
            vscode.TreeItemCollapsibleState.None,
          ),
        ]
      }

      return categoryProblemsets.map((ps) => new ProblemsetTreeItem(ps))
    }

    // Problemset level: Return problems within the problemset
    if (element instanceof ProblemsetTreeItem) {
      try {
        let problemsetDetails = this.problemsetCache.get(element.problemset.id)
        if (!problemsetDetails || !problemsetDetails.problems) {
          console.log(
            `Fetching details for problemset ${element.problemset.id}`,
          )
          problemsetDetails = await this.problemsetService.getProblemsetDetails(
            element.problemset.id,
          )
          this.problemsetCache.set(element.problemset.id, problemsetDetails)
        }

        if (
          problemsetDetails &&
          problemsetDetails.problems &&
          problemsetDetails.problems.length > 0
        ) {
          // Sort problems by ID
          problemsetDetails.problems.sort((a, b) => a.id - b.id)

          const result: AcmojTreeItem[] = []

          // Add description as multiple line items
          if (problemsetDetails.description) {
            const descriptionLines = this.splitTextIntoLines(
              problemsetDetails.description,
            )

            result.push(
              new ProblemsetBriefTreeItem('', element.problemset.id, true),
            )

            for (let i = 0; i < descriptionLines.length; i++) {
              result.push(
                new ProblemsetBriefTreeItem(
                  '- ' + descriptionLines[i],
                  element.problemset.id,
                  false,
                ),
              )
            }
          } else {
            result.push(
              new ProblemsetBriefTreeItem(
                'No description available',
                element.problemset.id,
                true,
              ),
            )
          }

          // Add the problems after the description
          result.push(
            ...problemsetDetails.problems.map(
              (p) => new ProblemBriefTreeItem(p, element.problemset.id),
            ),
          )

          return result
        } else {
          return [
            new ProblemsetBriefTreeItem(
              'No description available',
              element.problemset.id,
              true,
            ),
            new vscode.TreeItem(
              'No problems found in this problemset.',
              vscode.TreeItemCollapsibleState.None,
            ),
          ]
        }
      } catch (error: any) {
        vscode.window.showErrorMessage(
          `Failed to load problems for problemset ${element.problemset.id}: ${error.message}`,
        )
        return [
          new vscode.TreeItem(
            `Error: ${error.message}`,
            vscode.TreeItemCollapsibleState.None,
          ),
        ]
      }
    }

    // Problem level (leaf node)
    if (element instanceof ProblemBriefTreeItem) {
      return []
    }

    return []
  }

  // Helper function to split text into lines and remove markdown formatting
  private splitTextIntoLines(text: string): string[] {
    // Remove markdown formatting
    const cleanText = text
      .replace(/\*\*(.+?)\*\*/g, '$1') // bold
      .replace(/\*(.+?)\*/g, '$1') // italic
      .replace(/\_\_(.+?)\_\_/g, '$1') // bold
      .replace(/\_(.+?)\_/g, '$1') // italic
      .replace(/\[(.+?)\]\(.+?\)/g, '$1') // links
      .replace(/\`\`\`[\s\S]*?\`\`\`/g, '') // code blocks
      .replace(/\`(.+?)\`/g, '$1') // inline code
      .replace(/\#{1,6}\s+(.+)/g, '$1') // headers
      .replace(/^\s*>\s*(.*)$/gm, '$1') // blockquotes
      .replace(/^\s*[\*\-\+]\s+/gm, '') // unordered lists
      .replace(/^\s*\d+\.\s+/gm, '') // ordered lists

    const lines = cleanText.split('\n')
    return lines.map((line) => line.trim()).filter((line) => line.length > 0)
  }
}

type ProblemsetCategory = 'upcoming' | 'ongoing' | 'passed'

class CategoryTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly categoryType: ProblemsetCategory,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode
      .TreeItemCollapsibleState.Collapsed,
  ) {
    super(label, collapsibleState)
    this.id = `category-${categoryType}`
    switch (categoryType) {
      case 'ongoing':
        this.iconPath = new vscode.ThemeIcon('debug-start')
        break
      case 'upcoming':
        this.iconPath = new vscode.ThemeIcon('calendar')
        break
      case 'passed':
        this.iconPath = new vscode.ThemeIcon('check-all')
        break
    }
  }
}

// Represents a Problemset in the TreeView
export class ProblemsetTreeItem extends vscode.TreeItem {
  constructor(public readonly problemset: Problemset) {
    super(
      problemset.name || `Problemset ${problemset.id}`,
      // Problemsets are expandable to show problems
      vscode.TreeItemCollapsibleState.Collapsed,
    )
    this.tooltip = `${problemset.name}\nType: ${problemset.type}\nStarts: ${new Date(problemset.start_time).toLocaleString()}\nEnds: ${new Date(problemset.end_time).toLocaleString()}`
    this.description = `(${problemset.type})`
    this.id = `problemset-${problemset.id}`
  }
}

// Represents a Problem Brief within a Problemset (renamed from ProblemTreeItem)
export class ProblemBriefTreeItem extends vscode.TreeItem {
  constructor(
    public readonly problem: ProblemBrief,
    public readonly problemsetId?: number,
    public readonly isFirstLine: boolean = false,
  ) {
    super(
      `${problem.id}: ${problem.title || '(Title Unavailable)'}`,
      vscode.TreeItemCollapsibleState.None, // Problems are leaf nodes here
    )
    this.tooltip = `Problem ${problem.id}`
    this.description = problem.title ? '' : 'Not published or no permission'
    // Create a unique ID by combining problemset ID with problem ID
    this.id = problemsetId
      ? `problemset-${problemsetId}-problem-${problem.id}`
      : `problem-${problem.id}`
    if (problem.id) {
      this.command = {
        command: 'acmoj.viewProblem',
        title: 'View Problem',
        arguments: [problem.id], // Pass problem ID
      }
    }
  }
}

// Represents a description of a problemset
export class ProblemsetBriefTreeItem extends vscode.TreeItem {
  constructor(
    public readonly text: string,
    public readonly problemsetId?: number,
    public readonly isFirstLine: boolean = false,
  ) {
    super(
      isFirstLine ? 'Problemset Description:' : text,
      vscode.TreeItemCollapsibleState.None,
    )

    if (isFirstLine) {
      this.description = text
      this.iconPath = new vscode.ThemeIcon('info')
    } else {
      this.description = ''
      // Indent non-first lines with spaces to make it visually appear as a block
      this.label = ` ${text}`
    }
    // Create a unique ID for description items as well
    this.id = problemsetId
      ? `problemset-${problemsetId}-description-${isFirstLine ? 'header' : Math.random().toString(36).substring(2, 10)}`
      : undefined
    this.contextValue = 'problemsetDescription'
  }
}
