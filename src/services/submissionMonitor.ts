import * as vscode from 'vscode'
import { ApiClient } from '../core/api'
import { SubmissionProvider } from '../views/submissionProvider'
import { SubmissionService } from './submissionService'
import { Submission } from '../types'
import { CacheService } from './cacheService'

/**
 * Submission monitoring service
 * Used to track recent submissions and refresh the submission list when status changes
 */
export class SubmissionMonitorService {
  private monitoredSubmissions: Map<number, string> = new Map()
  private timer: NodeJS.Timeout | undefined
  private monitorInterval: number = 3000 // Default check interval: 3 seconds
  private maxAttempts: number = 40 // Maximum monitoring duration = interval * maxAttempts (about 2 minutes)

  constructor(
    private apiClient: ApiClient,
    private cacheService: CacheService,
    private submissionService: SubmissionService,
    private submissionProvider: SubmissionProvider,
  ) {
    // Read monitoring interval from configuration
    const config = vscode.workspace.getConfiguration('acmoj')
    this.monitorInterval = config.get<number>('submissionMonitorInterval', 3000)

    // Calculate max attempts = timeout / monitoring interval
    const timeout = config.get<number>('submissionMonitorTimeout', 120000)
    this.maxAttempts = Math.ceil(timeout / this.monitorInterval)
  }

  /**
   * Start the monitoring service
   */
  start() {
    if (this.timer) {
      return // Already running, don't start again
    }

    console.log('Starting submission monitor service')
    this.timer = setInterval(
      () => this.checkSubmissions(),
      this.monitorInterval,
    )
  }

  /**
   * Stop the monitoring service
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
      console.log('Submission monitor service stopped')
    }
    this.monitoredSubmissions.clear()
  }

  /**
   * Add a submission to the monitoring list
   */
  addSubmission(submissionId: number, initialStatus: string = 'Queued') {
    console.log(
      `Adding submission #${submissionId} to monitor (${initialStatus})`,
    )
    this.monitoredSubmissions.set(submissionId, initialStatus)
    this.start() // Ensure monitoring is started
  }

  /**
   * Check all monitored submissions
   */
  private async checkSubmissions() {
    if (this.monitoredSubmissions.size === 0) {
      this.stop() // No submissions to monitor, stop the service
      return
    }

    let hasChanges = false
    const submissionsToRemove: number[] = []

    for (const [
      submissionId,
      lastStatus,
    ] of this.monitoredSubmissions.entries()) {
      try {
        // Clear this submission's cache first to ensure we get the latest status
        this.cacheService.delete(`submission:${submissionId}`)

        const submission =
          await this.submissionService.getSubmissionDetails(submissionId)
        const currentStatus = submission.status

        // If the status has changed
        if (lastStatus !== currentStatus) {
          console.log(
            `Submission #${submissionId} status changed: ${lastStatus} -> ${currentStatus}`,
          )
          this.monitoredSubmissions.set(submissionId, currentStatus)
          hasChanges = true

          // Show notification
          this.showStatusChangeNotification(submissionId, submission)

          // Clear submission list cache to ensure we get the latest data on refresh
          this.cacheService.deleteWithPrefix('submissions:')
        }

        // If the submission has been processed, remove from monitoring
        if (this.isTerminalStatus(currentStatus)) {
          submissionsToRemove.push(submissionId)
        }

        // Check monitoring duration
        const attempts = this.getMonitoringAttempts(submissionId)
        if (attempts >= this.maxAttempts) {
          submissionsToRemove.push(submissionId)
          console.log(`Submission #${submissionId} monitoring timed out`)
        }
      } catch (error) {
        console.error(`Error checking submission #${submissionId}:`, error)
      }
    }

    // Remove completed submissions
    for (const id of submissionsToRemove) {
      this.monitoredSubmissions.delete(id)
    }

    // If there are status changes, force refresh the submission list
    if (hasChanges) {
      // Clear list cache first
      this.cacheService.deleteWithPrefix('submissions:list:')
      // Then refresh the view
      this.submissionProvider.refresh()
    }
  }

  /**
   * Determine if the submission status is terminal (will not change further)
   */
  private isTerminalStatus(status: string): boolean {
    const terminalStatuses = [
      'Accepted',
      'Wrong Answer',
      'Time Limit Exceeded',
      'Memory Limit Exceeded',
      'Runtime Error',
      'Compilation Error',
      'System Error',
      'Canceled',
      'Aborted',
      'Judged',
      'Failed',
    ]
    return terminalStatuses.includes(status)
  }

  /**
   * Show status change notification
   */
  private showStatusChangeNotification(
    submissionId: number,
    submission: Submission,
  ) {
    const statusIconMap: Record<string, string> = {
      Accepted: '$(check)',
      'Wrong Answer': '$(x)',
      'Time Limit Exceeded': '$(watch)',
      'Memory Limit Exceeded': '$(database)',
      'Runtime Error': '$(error)',
      'Compilation Error': '$(tools)',
      Queued: '$(history)',
      Running: '$(sync)',
      'System Error': '$(warning)',
      Aborted: '$(stop)',
      Canceled: '$(circle-slash)',
    }

    const icon = statusIconMap[submission.status] || '$(question)'
    const message = `Submission #${submissionId} ${icon} ${submission.status}`

    if (this.isTerminalStatus(submission.status)) {
      // Show details button for terminal status
      vscode.window
        .showInformationMessage(message, 'View Details')
        .then((selection) => {
          if (selection === 'View Details') {
            vscode.commands.executeCommand('acmoj.viewSubmission', submissionId)
          }
        })
    } else {
      // Only show notification for non-terminal status
      vscode.window.showInformationMessage(message)
    }
  }

  /**
   * Get monitoring attempt count (prevents infinite monitoring)
   */
  private getMonitoringAttempts(submissionId: number): number {
    const key = `monitor_attempts_${submissionId}`
    const attempts = Number(this.cacheService.get(key) || 0)
    this.cacheService.set(key, attempts + 1, 10) // Store for 10 minutes
    return attempts
  }
}
