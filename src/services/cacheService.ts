import * as vscode from 'vscode'

/**
 * Generic caching service with TTL and stale-while-revalidate functionality.
 * Provides methods to store, retrieve and manage cached data with expiration.
 *
 * @template T - Type of data to be cached
 */
interface CacheEntry<T> {
  data: T
  expires: number
  staleUntil?: number
}

/**
 * Service for caching data with time-to-live (TTL) and stale data handling.
 * Automatically cleans expired entries and supports fallback to stale data
 * when network requests fail.
 *
 * @template T - Type of data to be stored in the cache
 */
export class CacheService<T = unknown> {
  private cache: Map<string, CacheEntry<T>> = new Map()
  private defaultTTL: number
  private stalePeriod: number // Stale period after expiration (milliseconds)

  /**
   * Creates a new CacheService instance.
   *
   * @param defaultTTLInMinutes - Default time-to-live for cache entries in minutes
   */
  constructor(
    defaultTTLInMinutes: number = vscode.workspace
      .getConfiguration('acmoj')
      .get<number>('cacheDefaultTtlMinutes', 15),
  ) {
    this.defaultTTL = defaultTTLInMinutes * 60 * 1000
    this.stalePeriod = 30 * 60 * 1000 // Default 30 minutes of stale data availability as fallback

    // Clean expired entries every minute
    setInterval(() => this.cleanExpiredEntries(), 60000)
  }

  /**
   * Gets a cache item by key.
   * Returns undefined if the item has expired or doesn't exist.
   *
   * @param key - Unique identifier for the cache entry
   * @returns The cached data or undefined if expired/not found
   */
  get(key: string): T | undefined {
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

    return entry.data
  }

  /**
   * Stores an item in the cache with optional custom TTL.
   *
   * @param key - Unique identifier for the cache entry
   * @param data - Data to be stored
   * @param ttlMinutes - Optional custom TTL in minutes
   */
  set(key: string, data: T, ttlMinutes?: number): void {
    const ttl = ttlMinutes ? ttlMinutes * 60 * 1000 : this.defaultTTL
    const expires = Date.now() + ttl
    this.cache.set(key, {
      data,
      expires,
      staleUntil: expires + this.stalePeriod,
    })
  }

  /**
   * Removes an entry from the cache.
   *
   * @param key - Unique identifier for the cache entry
   */
  delete(key: string): void {
    this.cache.delete(key)
  }

  /**
   * Clears the entire cache.
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Disposes of the cache service.
   * This is a no-op in this implementation but can be used for cleanup if needed.
   */
  dispose(): void {
    // No-op for now
  }

  /**
   * Cleans expired cache entries.
   * Only removes entries that are completely expired (including stale period).
   *
   * @private
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
   * Gets data from cache or fetches it using the provided function.
   * Falls back to stale data if fetch fails and stale data is available.
   *
   * @param key - Unique identifier for the cache entry
   * @param fetchFn - Function to fetch fresh data if not in cache
   * @param ttlMinutes - Optional custom TTL in minutes
   * @returns Promise resolving to the requested data
   */
  async getOrFetch(
    key: string,
    fetchFn: () => Promise<T>,
    ttlMinutes?: number,
  ): Promise<T> {
    // First try to get from cache
    const cached = this.get(key)
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
      const staleEntry = this.getStaleEntry(key)
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
   * Gets an entry that is expired but still within stale period.
   *
   * @param key - Unique identifier for the cache entry
   * @returns The stale data or undefined if not available
   * @private
   */
  private getStaleEntry(key: string): T | undefined {
    const entry = this.cache.get(key)
    if (!entry) return undefined

    const now = Date.now()
    // Expired but within stale period
    if (now > entry.expires && entry.staleUntil && now <= entry.staleUntil) {
      return entry.data
    }

    return undefined
  }

  /**
   * Deletes all cache entries with keys that start with the given prefix.
   *
   * @param prefix - The prefix to match against cache keys
   */
  deleteWithPrefix(prefix: string): void {
    this.cache.forEach((_, key) => {
      if (key.startsWith(prefix)) {
        this.cache.delete(key)
      }
    })
  }
}
