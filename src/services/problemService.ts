import { ApiClient } from '../core/api'
import { CacheService } from './cacheService'
import { ProblemBrief, Problem, Problemset } from '../types'

export class ProblemService {
  private apiClient: ApiClient
  private cacheService: CacheService

  constructor(apiClient: ApiClient, cacheService: CacheService) {
    this.apiClient = apiClient
    this.cacheService = cacheService
  }

  async getProblems(
    cursor?: string,
    keyword?: string,
    problemsetId?: number,
  ): Promise<{ problems: ProblemBrief[]; next: string | null }> {
    const cacheKey = `problems:list:${problemsetId || 'all'}:${keyword || ''}:${cursor || 'first'}`
    const ttlMinutes = 5 // Cache problem list for 5 minutes

    return this.cacheService.getOrFetch(
      cacheKey,
      async () => {
        const params: Record<string, any> = {}
        if (cursor) params.cursor = cursor
        if (keyword) params.keyword = keyword
        if (problemsetId) params.problemset_id = problemsetId

        // Use apiClient.get which handles retries etc.
        const response = await this.apiClient.get<{
          problems: ProblemBrief[]
          next: string | null
        }>('/problem/', { params })
        return response
      },
      ttlMinutes,
    )
  }

  async getProblemDetails(problemId: number): Promise<Problem> {
    const cacheKey = `problem:detail:${problemId}`
    const ttlMinutes = 30 // Problem details change rarely

    return this.cacheService.getOrFetch(
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
      this.cacheService.delete(`problem:detail:${problemId}`)
    }
    // Invalidate list caches - more complex, might need prefix deletion
    this.cacheService.deleteWithPrefix('problems:list:')
    console.log(
      `Problem cache cleared (Problem ID: ${problemId || 'All Lists'})`,
    )
  }
}
