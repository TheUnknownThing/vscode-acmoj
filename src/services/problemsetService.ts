import { ApiClient } from '../core/api'
import { CacheService } from './cacheService'
import { Problemset } from '../types'

export class ProblemsetService {
  private apiClient: ApiClient
  private cacheService: CacheService

  constructor(apiClient: ApiClient, cacheService: CacheService) {
    this.apiClient = apiClient
    this.cacheService = cacheService
  }

  async getUserProblemsets(): Promise<Problemset[]> {
    const cacheKey = `user:problemsets:list`
    const ttlMinutes = 15

    return this.cacheService.getOrFetch(
      cacheKey,
      async () => {
        // Assuming the API returns { problemsets: Problemset[] }
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

    return this.cacheService.getOrFetch(
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
      this.cacheService.delete(`problemset:detail:${problemsetId}`)
    }
    this.cacheService.delete(`user:problemsets:list`)
    console.log(
      `Problemset cache cleared (Problemset ID: ${problemsetId || 'User List'})`,
    )
  }
}
