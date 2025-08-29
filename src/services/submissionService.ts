import * as querystring from 'querystring'
import * as vscode from 'vscode'
import { ApiClient } from '../core/api'
import { CacheService } from './cacheService'
import { SubmissionBrief, Submission } from '../types'

type SubmissionListCache = {
  submissions: SubmissionBrief[]
  next: string | null
}

/**
 * Service for managing submissions in the Online Judge platform.
 * Handles submission creation, retrieval, and caching of submission data.
 */
export class SubmissionService {
  private apiClient: ApiClient
  private submissionListCache: CacheService<SubmissionListCache>
  private submissionDetailCache: CacheService<Submission>
  private submissionCodeCache: CacheService<string>

  /**
   * Creates a new SubmissionService instance.
   * @param apiClient - The API client used to make requests
   */
  constructor(apiClient: ApiClient) {
    this.apiClient = apiClient
    this.submissionListCache = new CacheService<SubmissionListCache>()
    this.submissionDetailCache = new CacheService<Submission>()
    this.submissionCodeCache = new CacheService<string>()
  }

  /**
   * Submits code to the Online Judge platform.
   * @param problemId - The ID of the problem being submitted
   * @param language - The programming language of the submission
   * @param code - The source code to submit
   * @param isPublic - Whether the submission should be public (default false)
   * @returns A promise resolving to an object containing the submission ID
   */
  async submitCode(
    problemId: number,
    language: string,
    code: string,
    isPublic: boolean = false,
  ): Promise<{ id: number }> {
    // No caching for submission action itself
    const response = await this.apiClient.post<{ id: number }>(
      `/problem/${problemId}/submit`,
      querystring.stringify({ language, code, public: isPublic }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      },
    )

    // IMPORTANT: Clear relevant caches after successful submission
    this.clearSubmissionListCaches() // Clear lists
    // Don't clear specific submission detail cache yet, it doesn't exist

    return response
  }

  /**
   * Fetches a list of submissions with optional filters.
   * Uses cache with a default TTL of 5 minutes.
   * @param cursor - Optional cursor for pagination
   * @param username - Optional username filter
   * @param problemId - Optional problem ID filter
   * @param status - Optional submission status filter
   * @param lang - Optional programming language filter
   * @returns A promise resolving to an object containing submissions and next cursor
   */
  async getSubmissions(
    cursor?: string,
    username?: string,
    problemId?: number,
    status?: string,
    lang?: string,
  ): Promise<{ submissions: SubmissionBrief[]; next: string | null }> {
    // Construct a descriptive cache key
    const filterParts = [
      `user:${username || 'all'}`,
      `prob:${problemId || 'all'}`,
      `stat:${status || 'all'}`,
      `lang:${lang || 'all'}`,
      `cursor:${cursor || 'first'}`,
    ]
    const cacheKey = `submissions:list:${filterParts.join(':')}`
    const ttlMinutes = 5

    return this.submissionListCache.getOrFetch(
      cacheKey,
      async () => {
        const params: Record<string, unknown> = {}
        if (cursor) params.cursor = cursor
        if (username) params.username = username
        if (problemId) params.problem_id = problemId
        if (status) params.status = status
        if (lang) params.lang = lang

        const response = await this.apiClient.get<SubmissionListCache>(
          '/submission/',
          { params },
        )
        return response
      },
      ttlMinutes,
    )
  }

  /**
   * Fetches detailed information about a specific submission.
   * Uses cache with different TTLs based on submission status.
   * @param submissionId - The ID of the submission to fetch
   * @returns A promise resolving to the Submission object
   */
  async getSubmissionDetails(submissionId: number): Promise<Submission> {
    const cacheKey = `submission:detail:${submissionId}`
    // Check cache first, but fetch function will always call API
    // unless the submission is already terminal (Accepted, WA, TLE etc.)

    const cached = this.submissionDetailCache.get(cacheKey)
    if (cached) {
      if (!cached.should_auto_reload) {
        return cached
      }
    }

    // Fetch always if not terminal or not cached/expired
    // console.log(`[Cache MISS/NonTerminal] Submission ${submissionId}`);
    const submission = await this.apiClient.get<Submission>(
      `/submission/${submissionId}`,
    )

    // Cache based on status: longer for terminal, shorter for pending/judging
    const ttlMinutes = submission.should_auto_reload ? 1 : 15 // 15 min for terminal stat, 1 min otherwise
    this.submissionDetailCache.set(cacheKey, submission, ttlMinutes)

    return submission
  }

  /**
   * Fetches the source code for a submission.
   * Uses cache with a default TTL of 60 minutes.
   * @param submissionId - The ID of the submission
   * @param codeUrl - The URL to fetch the code from
   * @returns A promise resolving to the submission code as string
   * @throws Error if code URL is not available or fetch fails
   */
  async getSubmissionCode(
    submissionId: number,
    codeUrl?: string,
  ): Promise<string> {
    if (!codeUrl) {
      throw new Error(`Code URL not available for submission ${submissionId}`)
    }

    let normalizedUrl = codeUrl
    try {
      const config = vscode.workspace.getConfiguration('acmoj')
      const apiBasePath = config.get<string>(
        'apiBasePath',
        '/OnlineJudge/api/v1',
      )

      if (normalizedUrl.startsWith(apiBasePath)) {
        normalizedUrl = normalizedUrl.slice(apiBasePath.length)
      }

      normalizedUrl = normalizedUrl.replace(/^\/+/, '')
    } catch (e) {
      console.warn(
        'Failed to normalize codeUrl, using original value:',
        codeUrl,
        e,
      )
      normalizedUrl = codeUrl
    }

    const cacheKey = `submission:code:${submissionId}`
    const ttlMinutes = 60 // Code content is immutable

    return this.submissionCodeCache.getOrFetch(
      cacheKey,
      async () => {
        try {
          const response = await this.apiClient.get<string>(normalizedUrl, {
            timeout: 10000, // Separate timeout for code fetching
            responseType: 'text',
          })
          return response
        } catch (error: unknown) {
          let message = 'Unknown error'
          if (error instanceof Error) {
            message = error.message
          }
          console.error(
            `Failed to fetch code from ${codeUrl} for submission ${submissionId}:`,
            message,
          )
          // Provide a more specific error message
          if (error instanceof Error && error.message.includes('403')) {
            throw new Error('Permission denied to fetch submission code.')
          } else if (error instanceof Error && error.message.includes('404')) {
            throw new Error('Submission code not found.')
          }
          throw new Error('Failed to fetch submission code.')
        }
      },
      ttlMinutes,
    )
  }

  /**
   * Attempts to abort a running submission.
   * @param submissionId - The ID of the submission to abort
   * @returns A promise that resolves when the abort is complete
   */
  async abortSubmission(submissionId: number): Promise<void> {
    // No caching for abort action
    await this.apiClient.post<void>(`/submission/${submissionId}/abort`)

    // Clear relevant caches
    this.clearSubmissionListCaches()
    this.submissionDetailCache.delete(`submission:detail:${submissionId}`)
    this.submissionCodeCache.delete(`submission:code:${submissionId}`)
    console.log(`Submission ${submissionId} aborted and caches cleared.`)
  }

  // --- Cache Management ---

  /**
   * Clears all submission list caches.
   * Used when new submissions are made or statuses change.
   */
  clearSubmissionListCaches(): void {
    this.submissionListCache.deleteWithPrefix('submissions:list:')
    // console.log('Submission list caches cleared.');
  }

  /**
   * Clears cache for a specific submission.
   * @param submissionId - The ID of the submission to clear
   */
  clearSubmissionDetailCache(submissionId: number): void {
    this.submissionDetailCache.delete(`submission:detail:${submissionId}`)
    this.submissionCodeCache.delete(`submission:code:${submissionId}`)
    // console.log(`Cache cleared for submission ${submissionId}.`);
  }

  /**
   * Clears all submission-related caches.
   * Used when needing to force fresh data from the server.
   */
  clearAllSubmissionCaches(): void {
    this.clearSubmissionListCaches()
    this.submissionDetailCache.deleteWithPrefix('submission:detail:')
    this.submissionCodeCache.deleteWithPrefix('submission:code:')
    console.log('All submission caches cleared.')
  }
}
