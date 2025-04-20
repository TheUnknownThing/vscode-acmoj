import { ApiClient } from '../core/api'
import { CacheService } from './cacheService'
import { Problemset } from '../types'

export class ProblemsetService {
  private apiClient: ApiClient
  private problemsetsCache: CacheService<Problemset[]>
  private problemsetDetailsCache: CacheService<Problemset> // New cache for single problemset details

  constructor(apiClient: ApiClient) {
    this.apiClient = apiClient
    this.problemsetsCache = new CacheService<Problemset[]>()
    this.problemsetDetailsCache = new CacheService<Problemset>() // Initialize the new cache
  }

  async getUserProblemsets(): Promise<Problemset[]> {
    const cacheKey = `user:problemsets:list`
    const ttlMinutes = 15

    return this.problemsetsCache.getOrFetch(
      cacheKey,
      async () => {
        const response = await this.apiClient.get<{
          problemsets: Problemset[]
        }>('/user/problemsets')
        return response.problemsets // Return the array directly
      },
      ttlMinutes,
    )
  }

  async getProblemsetDetails(problemsetId: number): Promise<Problemset> {
    const cacheKey = `problemset:detail:${problemsetId}`
    const ttlMinutes = 20

    return this.problemsetDetailsCache.getOrFetch(
      // Use the details cache instead
      cacheKey,
      async () => {
        const response = await this.apiClient.get<Problemset>(
          `/problemset/${problemsetId}`,
        )
        return response
      },
      ttlMinutes,
    )
  }

  clearProblemsetCache(problemsetId?: number): void {
    if (problemsetId) {
      this.problemsetDetailsCache.delete(`problemset:detail:${problemsetId}`) // Updated to use details cache
    }
    this.problemsetsCache.delete(`user:problemsets:list`) // Use list cache
    console.log(
      `Problemset cache cleared (Problemset ID: ${problemsetId || 'User List'})`,
    )
  }
}
