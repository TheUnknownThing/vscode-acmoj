import * as vscode from 'vscode'

interface CacheEntry<T> {
  data: T
  expires: number
  staleUntil?: number // Allow data to be used as a fallback after expiration
}

export class CacheService {
  private cache: Map<string, CacheEntry<any>> = new Map()
  private defaultTTL: number
  private stalePeriod: number // Stale period after expiration (milliseconds)

  constructor(defaultTTLInMinutes: number = 5) {
    this.defaultTTL = defaultTTLInMinutes * 60 * 1000
    this.stalePeriod = 30 * 60 * 1000 // Default 30 minutes of stale data availability as fallback

    // Clean expired entries every minute
    setInterval(() => this.cleanExpiredEntries(), 60000)
  }

  /**
   * Get a cache item by key
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key)
    if (!entry) return undefined

    const now = Date.now()
    if (now > entry.expires) {
      // Completely expired, remove from cache
      if (entry.staleUntil && now > entry.staleUntil) {
        this.cache.delete(key)
      }
      return undefined
    }

    return entry.data as T
  }

  /**
   * Store an item in the cache
   */
  set<T>(key: string, data: T, ttlMinutes?: number): void {
    const ttl = ttlMinutes ? ttlMinutes * 60 * 1000 : this.defaultTTL
    const expires = Date.now() + ttl
    this.cache.set(key, {
      data,
      expires,
      staleUntil: expires + this.stalePeriod,
    })
  }

  /**
   * Remove an entry from the cache
   */
  delete(key: string): void {
    this.cache.delete(key)
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Dispose of the cache service
   * This is a no-op in this implementation but can be used for cleanup if needed
   */
  dispose(): void {
    // No-op for now
  }

  /**
   * Clean expired cache entries
   */
  private cleanExpiredEntries(): void {
    const now = Date.now()
    this.cache.forEach((entry, key) => {
      // Only clean entries that are completely expired (including stale period)
      if (entry.staleUntil && now > entry.staleUntil) {
        this.cache.delete(key)
      }
    })
  }

  /**
   * Get from cache or fetch from API
   */
  async getOrFetch<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlMinutes?: number,
  ): Promise<T> {
    // First try to get from cache
    const cached = this.get<T>(key)
    if (cached !== undefined) {
      return cached
    }

    try {
      // Fetch new data from API
      const data = await fetchFn()
      this.set(key, data, ttlMinutes)
      return data
    } catch (error) {
      // Network error but expired data exists, try using stale data
      const staleEntry = this.getStaleEntry<T>(key)
      if (staleEntry) {
        vscode.window.showInformationMessage(
          'Using cached data due to unstable network connection.',
        )
        return staleEntry
      }
      throw error
    }
  }

  /**
   * Get an entry that is expired but still within stale period
   */
  private getStaleEntry<T>(key: string): T | undefined {
    const entry = this.cache.get(key)
    if (!entry) return undefined

    const now = Date.now()
    // Expired but within stale period
    if (now > entry.expires && entry.staleUntil && now <= entry.staleUntil) {
      return entry.data as T
    }

    return undefined
  }

  /**
   * Delete entries with matching prefix
   */
  deleteWithPrefix(prefix: string): void {
    this.cache.forEach((_, key) => {
      if (key.startsWith(prefix)) {
        this.cache.delete(key)
      }
    })
  }
}
