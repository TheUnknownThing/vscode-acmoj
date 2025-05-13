import { ApiClient } from '../core/api'
import { CacheService } from './cacheService'
import { ProblemBrief, Problem } from '../types'

/**
 * Service for managing problems in the Online Judge platform.
 * Handles fetching and caching of problem lists and problem details.
 */
export class ProblemService {
  private apiClient: ApiClient
  private problemListCache: CacheService<{
    problems: ProblemBrief[]
    next: string | null
  }>
  private problemDetailCache: CacheService<Problem>

  constructor(apiClient: ApiClient) {
    this.apiClient = apiClient
    this.problemListCache = new CacheService<{
      problems: ProblemBrief[]
      next: string | null
    }>()
    this.problemDetailCache = new CacheService<Problem>()
  }

  /**
   * Fetches a list of problems with optional filters (cursor, keyword, problemset ID).
   * Uses cache with a default TTL of 5 minutes.
   * @param cursor Optional cursor for pagination.
   * @param keyword Optional keyword for filtering problems.
   * @param problemsetId Optional problem set ID for filtering problems.
   * @returns A promise resolving to an object containing the list of problems and the next cursor.
   */
  async getProblems(
    cursor?: string,
    keyword?: string,
    problemsetId?: number,
  ): Promise<{ problems: ProblemBrief[]; next: string | null }> {
    const cacheKey = `problems:list:${problemsetId || 'all'}:${keyword || ''}:${cursor || 'first'}`
    const ttlMinutes = 5 // Cache problem list for 5 minutes

    return this.problemListCache.getOrFetch(
      cacheKey,
      async () => {
        const params: Record<string, unknown> = {}
        if (cursor) params.cursor = cursor
        if (keyword) params.keyword = keyword
        if (problemsetId) params.problemset_id = problemsetId

        const response = await this.apiClient.get<{
          problems: ProblemBrief[]
          next: string | null
        }>('/problem/', { params })
        return response
      },
      ttlMinutes,
    )
  }

  /**
   * Fetches detailed information about a specific problem.
   * Uses cache with a default TTL of 30 minutes.
   * @param problemId The ID of the problem to fetch details for.
   * @returns A promise resolving to the Problem object.
   */
  async getProblemDetails(problemId: number): Promise<Problem> {
    const cacheKey = `problem:detail:${problemId}`
    const ttlMinutes = 30 // Problem details change rarely

    return this.problemDetailCache.getOrFetch(
      cacheKey,
      async () => {
        const response = await this.apiClient.get<Problem>(
          `/problem/${problemId}`,
        )
        return response
      },
      ttlMinutes,
    )
  }

  /**
   * Clears the cache for a specific problem or all problem-related caches.
   * @param problemId Optional ID of the problem to clear the cache for. If not provided, clears all problem list caches.
   */
  clearProblemCache(problemId?: number): void {
    if (problemId) {
      this.problemDetailCache.delete(`problem:detail:${problemId}`)
    }
    // Invalidate list caches - more complex, might need prefix deletion
    this.problemListCache.deleteWithPrefix('problems:list:')
    console.log(
      `Problem cache cleared (Problem ID: ${problemId || 'All Lists'})`,
    )
  }
}
