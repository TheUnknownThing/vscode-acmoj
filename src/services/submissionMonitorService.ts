import * as vscode from 'vscode'
import { SubmissionProvider } from '../views/submissionProvider'
import { SubmissionService } from './submissionService'
import { Submission } from '../types'
import { CacheService } from './cacheService'

/**
 * Service for monitoring submission status changes in real-time.
 * Tracks submissions through their lifecycle (Queued -> Judging -> Completed)
 * and provides notifications when status changes occur.
 * Automatically refreshes the submission list view when needed.
 */
export class SubmissionMonitorService {
  private monitoredSubmissions: Map<number, string> = new Map()
  private timer: ReturnType<typeof setInterval> | undefined
  private monitorInterval: number = 3000 // Default check interval: 3 seconds
  private maxAttempts: number = 40 // Maximum monitoring duration = interval * maxAttempts (about 2 minutes)
  private cacheService: CacheService<number> = new CacheService<number>()

  /**
   * Creates a new SubmissionMonitorService instance.
   * @param submissionService - The submission service for fetching submission details
   * @param submissionProvider - The submission provider for refreshing the view
   */
  constructor(
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
   * Starts the monitoring service.
   * Begins periodic checks of monitored submissions.
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
   * Stops the monitoring service.
   * Clears all monitored submissions and stops periodic checks.
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
   * Adds a submission to be monitored.
   * @param submissionId - The ID of the submission to monitor
   * @param initialStatus - The initial status of the submission (default 'Queued')
   */
  addSubmission(submissionId: number, initialStatus: string = 'Queued') {
    console.log(
      `Adding submission #${submissionId} to monitor (${initialStatus})`,
    )
    this.monitoredSubmissions.set(submissionId, initialStatus)
    this.start() // Ensure monitoring is started
  }

  /**
   * Checks all monitored submissions for status changes.
   * @private
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
        }

        if (submission.should_auto_reload) {
          submissionsToRemove.push(submissionId)
          if (!hasChanges) {
            hasChanges = true
          }
        }

        const attempts = this.getMonitoringAttempts(submissionId)
        if (attempts >= this.maxAttempts) {
          submissionsToRemove.push(submissionId)
          console.log(`Submission #${submissionId} monitoring timed out`)
          if (!hasChanges) {
            hasChanges = true
          }
        }
      } catch (error) {
        console.error(`Error checking submission #${submissionId}:`, error)
      }
    }

    // Remove completed submissions
    for (const id of submissionsToRemove) {
      this.monitoredSubmissions.delete(id)
    }

    // If there are status changes or submissions were removed, force refresh the submission list
    if (hasChanges) {
      console.log('Refreshing submission list due to status changes')
      this.submissionProvider.refresh()
    }
  }

  /**
   * Shows a notification when a submission's status changes.
   * @param submissionId - The ID of the submission
   * @param submission - The submission details
   * @private
   */
  private showStatusChangeNotification(
    submissionId: number,
    submission: Submission,
  ) {
    const message = `Submission #${submissionId} ${submission.status}`

    if (!submission.should_auto_reload) {
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
   * Tracks and returns the number of monitoring attempts for a submission.
   * @param submissionId - The ID of the submission
   * @returns The number of monitoring attempts
   * @private
   */
  private getMonitoringAttempts(submissionId: number): number {
    const key = `monitor_attempts_${submissionId}`
    const attempts = Number(this.cacheService.get(key) || 0)
    this.cacheService.set(key, attempts + 1, 10) // Store for 10 minutes
    return attempts
  }
}
