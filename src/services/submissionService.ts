import * as querystring from 'querystring'
import { ApiClient } from '../core/api'
import { CacheService } from './cacheService'
import { SubmissionBrief, Submission } from '../types'

type SubmissionListCache = {
  submissions: SubmissionBrief[]
  next: string | null
}

export class SubmissionService {
  private apiClient: ApiClient
  private submissionListCache: CacheService<SubmissionListCache>
  private submissionDetailCache: CacheService<Submission>
  private submissionCodeCache: CacheService<string>

  constructor(apiClient: ApiClient) {
    this.apiClient = apiClient
    this.submissionListCache = new CacheService<SubmissionListCache>()
    this.submissionDetailCache = new CacheService<Submission>()
    this.submissionCodeCache = new CacheService<string>()
  }

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

  async getSubmissionDetails(submissionId: number): Promise<Submission> {
    const cacheKey = `submission:detail:${submissionId}`
    // Check cache first, but fetch function will always call API
    // unless the submission is already terminal (Accepted, WA, TLE etc.)

    const cached = this.submissionDetailCache.get(cacheKey)
    if (cached) {
      // Check if cached submission is terminal
      if (this.isTerminalStatus(cached.status)) {
        // console.log(`[Cache HIT] Submission ${submissionId}`);
        return cached
      }
    }

    // Fetch always if not terminal or not cached/expired
    // console.log(`[Cache MISS/NonTerminal] Submission ${submissionId}`);
    const submission = await this.apiClient.get<Submission>(
      `/submission/${submissionId}`,
    )

    // Cache based on status: longer for terminal, shorter for pending/judging
    const ttlMinutes = this.isTerminalStatus(submission.status) ? 15 : 1 // 15 min for terminal, 1 min otherwise
    this.submissionDetailCache.set(cacheKey, submission, ttlMinutes)

    return submission
  }

  // Helper to determine if a status means the submission won't change
  private isTerminalStatus(status: string): boolean {
    const terminalStatuses = [
      'ACCEPTED',
      'WRONG_ANSWER',
      'TIME_LIMIT_EXCEEDED',
      'MEMORY_LIMIT_EXCEEDED',
      'RUNTIME_ERROR',
      'COMPILE_ERROR',
      'SYSTEM_ERROR',
      'CANCELED',
      'SKIPPED',
      'PRESENTATION_ERROR', // Add any other final states
    ]
    return terminalStatuses.includes(status?.toUpperCase())
  }

  async getSubmissionCode(
    submissionId: number,
    codeUrl?: string,
  ): Promise<string> {
    if (!codeUrl) {
      throw new Error(`Code URL not available for submission ${submissionId}`)
    }

    const cacheKey = `submission:code:${submissionId}` // Use submission ID for cache key
    const ttlMinutes = 60 // Code content is immutable

    return this.submissionCodeCache.getOrFetch(
      cacheKey,
      async () => {
        try {
          const response = await this.apiClient.get<string>(codeUrl, {
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

  async abortSubmission(submissionId: number): Promise<void> {
    // No caching for abort action
    await this.apiClient.post<void>(`/submission/${submissionId}/abort`)

    // Clear relevant caches
    this.clearSubmissionListCaches()
    this.submissionDetailCache.delete(`submission:detail:${submissionId}`)
    this.submissionCodeCache.delete(`submission:code:${submissionId}`) // Also clear code cache
    console.log(`Submission ${submissionId} aborted and caches cleared.`)
  }

  // --- Cache Management ---

  /** Clears all submission list caches */
  clearSubmissionListCaches(): void {
    this.submissionListCache.deleteWithPrefix('submissions:list:')
    // console.log('Submission list caches cleared.');
  }

  /** Clears cache for a specific submission */
  clearSubmissionDetailCache(submissionId: number): void {
    this.submissionDetailCache.delete(`submission:detail:${submissionId}`)
    this.submissionCodeCache.delete(`submission:code:${submissionId}`)
    // console.log(`Cache cleared for submission ${submissionId}.`);
  }

  /** Clears all submission-related caches */
  clearAllSubmissionCaches(): void {
    this.clearSubmissionListCaches()
    this.submissionDetailCache.deleteWithPrefix('submission:detail:')
    this.submissionCodeCache.deleteWithPrefix('submission:code:')
    console.log('All submission caches cleared.')
  }
}
