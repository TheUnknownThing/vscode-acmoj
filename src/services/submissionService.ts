import axios from 'axios' // Needed for direct code fetch if required
import * as querystring from 'querystring'
import { ApiClient } from '../core/api'
import { CacheService } from './cacheService'
import { SubmissionBrief, Submission } from '../types'

export class SubmissionService {
  private apiClient: ApiClient
  private cacheService: CacheService

  constructor(apiClient: ApiClient, cacheService: CacheService) {
    this.apiClient = apiClient
    this.cacheService = cacheService
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
    const ttlMinutes = 1 // Very short TTL for submission lists

    return this.cacheService.getOrFetch(
      cacheKey,
      async () => {
        const params: Record<string, any> = {}
        if (cursor) params.cursor = cursor
        if (username) params.username = username
        if (problemId) params.problem_id = problemId
        if (status) params.status = status
        if (lang) params.lang = lang

        const response = await this.apiClient.get<{
          submissions: SubmissionBrief[]
          next: string | null
        }>('/submission/', { params })
        return response
      },
      ttlMinutes,
    )
  }

  async getSubmissionDetails(submissionId: number): Promise<Submission> {
    const cacheKey = `submission:detail:${submissionId}`
    // Check cache first, but fetch function will always call API
    // unless the submission is already terminal (Accepted, WA, TLE etc.)

    const cached = this.cacheService.get<Submission>(cacheKey)
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
    this.cacheService.set(cacheKey, submission, ttlMinutes)

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
    // Prefer using a dedicated API endpoint if available, otherwise fallback to codeUrl
    // Example: Assume there's an endpoint `/submission/{id}/code`
    // const codeEndpoint = `/submission/${submissionId}/code`;

    // For now, stick to the original logic using codeUrl if provided
    if (!codeUrl) {
      // Maybe fetch submission details first to get the codeUrl if not provided?
      // const details = await this.getSubmissionDetails(submissionId);
      // codeUrl = details.code_url;
      // if (!codeUrl) {
      throw new Error(`Code URL not available for submission ${submissionId}`)
      // }
    }

    const cacheKey = `submission:code:${submissionId}` // Use submission ID for cache key
    const ttlMinutes = 60 // Code content is immutable

    return this.cacheService.getOrFetch(
      cacheKey,
      async () => {
        try {
          // IMPORTANT: Fetching from codeUrl might require different auth or no auth.
          // Using a separate axios instance or fetch might be necessary if it's
          // outside the standard API base and auth scheme.
          // Assuming it's a public URL or accessible without bearer token for now.
          const response = await axios.get<string>(codeUrl, {
            // If codeUrl is relative, construct absolute URL
            baseURL: codeUrl.startsWith('http')
              ? undefined
              : this.apiClient.getBaseUrl(),
            timeout: 10000, // Separate timeout for code fetching
          })
          return response.data
        } catch (error: any) {
          console.error(
            `Failed to fetch code from ${codeUrl} for submission ${submissionId}:`,
            error.message,
          )
          // Provide a more specific error message
          if (axios.isAxiosError(error) && error.response?.status === 403) {
            throw new Error('Permission denied to fetch submission code.')
          } else if (
            axios.isAxiosError(error) &&
            error.response?.status === 404
          ) {
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
    this.cacheService.delete(`submission:detail:${submissionId}`)
    this.cacheService.delete(`submission:code:${submissionId}`) // Also clear code cache
    console.log(`Submission ${submissionId} aborted and caches cleared.`)
  }

  // --- Cache Management ---

  /** Clears all submission list caches */
  clearSubmissionListCaches(): void {
    this.cacheService.deleteWithPrefix('submissions:list:')
    // console.log('Submission list caches cleared.');
  }

  /** Clears cache for a specific submission */
  clearSubmissionDetailCache(submissionId: number): void {
    this.cacheService.delete(`submission:detail:${submissionId}`)
    this.cacheService.delete(`submission:code:${submissionId}`)
    // console.log(`Cache cleared for submission ${submissionId}.`);
  }

  /** Clears all submission-related caches */
  clearAllSubmissionCaches(): void {
    this.clearSubmissionListCaches()
    this.cacheService.deleteWithPrefix('submission:detail:')
    this.cacheService.deleteWithPrefix('submission:code:')
    console.log('All submission caches cleared.')
  }
}
