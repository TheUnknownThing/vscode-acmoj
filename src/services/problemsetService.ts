import { ApiClient } from '../core/api'
import { CacheService } from './cacheService'
import { Problemset } from '../types'

/**
 * Service for managing problem sets in the Online Judge platform.
 * Handles fetching and caching of problem set lists and details.
 */
export class ProblemsetService {
  private apiClient: ApiClient
  private problemsetsCache: CacheService<Problemset[]>
  private problemsetDetailsCache: CacheService<Problemset> // New cache for single problemset details

  /**
   * Creates a new ProblemsetService instance.
   * @param apiClient - The API client used to make requests
   */
  constructor(apiClient: ApiClient) {
    this.apiClient = apiClient
    this.problemsetsCache = new CacheService<Problemset[]>()
    this.problemsetDetailsCache = new CacheService<Problemset>() // Initialize the new cache
  }

  /**
   * Fetches the list of problem sets available to the current user.
   * Uses cache with a default TTL of 15 minutes.
   * @returns A promise resolving to an array of Problemset objects
   */
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

  /**
   * Fetches detailed information about a specific problem set.
   * Uses cache with a default TTL of 20 minutes.
   * @param problemsetId - The ID of the problem set to fetch
   * @returns A promise resolving to the Problemset object
   */
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

  /**
   * Clears the cache for a specific problem set or all problem set caches.
   * @param problemsetId - Optional ID of the problem set to clear cache for.
   *                       If not provided, clears all problem set caches.
   */
  clearProblemsetCache(problemsetId?: number): void {
    if (problemsetId) {
      this.problemsetDetailsCache.delete(`problemset:detail:${problemsetId}`) // Updated to use details cache
    }
    this.problemsetsCache.delete(`user:problemsets:list`) // Use list cache
    console.log(
      `Problemset cache cleared (Problemset ID: ${problemsetId || 'User List'})`,
    )
  }

  /**
   * Clears all caches managed by this service.
   */
  clearAllCaches(): void {
    this.problemsetsCache.clear()
    this.problemsetDetailsCache.clear() // Clear the details cache
    console.log('All problemset caches cleared.')
  }
}
