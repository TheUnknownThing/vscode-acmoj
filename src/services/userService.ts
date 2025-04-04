import { ApiClient } from '../core/api' 
import { CacheService } from './cacheService' 
import { Profile } from '../types' 

export class UserService {
  private apiClient: ApiClient
  private cacheService: CacheService

  constructor(apiClient: ApiClient, cacheService: CacheService) {
    this.apiClient = apiClient
    this.cacheService = cacheService
  }

  async getUserProfile(): Promise<Profile> {
    const cacheKey = 'user:profile'
    const ttlMinutes = 60 // Cache profile for an hour

    return this.cacheService.getOrFetch(
      cacheKey,
      async () => {
        const response = await this.apiClient.get<Profile>('/user/profile')
        return response
      },
      ttlMinutes,
    )
  }

  clearUserProfileCache(): void {
    this.cacheService.delete('user:profile')
    console.log('User profile cache cleared.')
  }
}
