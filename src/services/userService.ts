import { ApiClient } from '../core/api'
import { CacheService } from './cacheService'
import { Profile } from '../types'

/**
 * Service for managing user-related operations in the Online Judge platform.
 * Handles fetching and caching of user profile information.
 */
export class UserService {
  private apiClient: ApiClient
  private cacheService: CacheService<Profile>

  /**
   * Creates a new UserService instance.
   * @param apiClient - The API client used to make requests
   */
  constructor(apiClient: ApiClient) {
    this.apiClient = apiClient
    this.cacheService = new CacheService<Profile>()
  }

  /**
   * Fetches the current user's profile information.
   * Uses cache with a default TTL of 120 minutes.
   * @returns A promise resolving to the user's Profile object
   */
  async getUserProfile(): Promise<Profile> {
    const cacheKey = 'user:profile'
    const ttlMinutes = 120 // Cache profile for two hours

    return this.cacheService.getOrFetch(
      cacheKey,
      async () => {
        const response = await this.apiClient.get<Profile>('/user/profile')
        return response
      },
      ttlMinutes,
    )
  }

  /**
   * Clears the cached user profile.
   * Used when profile information needs to be refreshed from the server.
   */
  clearUserProfileCache(): void {
    this.cacheService.delete('user:profile')
    console.log('User profile cache cleared.')
  }
}
