import { ApiClient } from '../core/api'
import { CacheService } from './cacheService'
import { ProblemBrief, Problem } from '../types'

type ProblemListCache = { problems: ProblemBrief[]; next: string | null }

export class ProblemService {
  private apiClient: ApiClient
  private problemListCache: CacheService<ProblemListCache>
  private problemDetailCache: CacheService<Problem>

  constructor(apiClient: ApiClient) {
    this.apiClient = apiClient
    this.problemListCache = new CacheService<ProblemListCache>()
    this.problemDetailCache = new CacheService<Problem>()
  }

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

        // Use apiClient.get which handles retries etc.
        const response = await this.apiClient.get<ProblemListCache>(
          '/problem/',
          { params },
        )
        return response
      },
      ttlMinutes,
    )
  }

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

  // Clear relevant caches if needed (e.g., if problems could be updated externally)
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
