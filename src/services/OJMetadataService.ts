import * as vscode from 'vscode'
import { ApiClient } from '../core/api'
import { CacheService } from './cacheService'
import { JudgeStatusInfo, LanguageInfo, Runner } from '../types'

/**
 * Service for fetching Online Judge platform metadata.
 * Handles caching for judge status info, language info, and runner status.
 */
export class OJMetadataService {
  private apiClient: ApiClient
  private judgeStatusCache: CacheService<JudgeStatusInfo>
  private languageInfoCache: CacheService<LanguageInfo>
  private RunnerCache: CacheService<Runner[]>
  private latestJudgeStatusInfo: JudgeStatusInfo | undefined
  private _onDidUpdateJudgeStatusInfo = new vscode.EventEmitter<void>()
  readonly onDidUpdateJudgeStatusInfo = this._onDidUpdateJudgeStatusInfo.event

  // Cache keys
  private static readonly JUDGE_STATUS_CACHE_KEY = 'meta:info:judge-status'
  private static readonly LANGUAGE_INFO_CACHE_KEY = 'meta:info:language'
  private static readonly RUNNER_STATUS_CACHE_KEY = 'meta:runner-status'

  // Cache TTLs in minutes
  private static readonly METADATA_TTL_MINUTES = 60 // Judge status and language info rarely change
  private static readonly RUNNER_STATUS_TTL_MINUTES = 1

  constructor(apiClient: ApiClient) {
    this.apiClient = apiClient
    this.judgeStatusCache = new CacheService<JudgeStatusInfo>()
    this.languageInfoCache = new CacheService<LanguageInfo>()
    this.RunnerCache = new CacheService<Runner[]>()
  }

  /**
   * Fetches information about judge status codes (name, short name, color).
   * Uses cache with a default TTL.
   * @returns A promise resolving to the JudgeStatusInfo object.
   */
  async getJudgeStatusInfo(): Promise<JudgeStatusInfo> {
    return this.judgeStatusCache.getOrFetch(
      OJMetadataService.JUDGE_STATUS_CACHE_KEY,
      async () => {
        const fresh = await this.apiClient.get<JudgeStatusInfo>(
          '/meta/info/judge-status',
        )
        const changed =
          !this.latestJudgeStatusInfo ||
          Object.keys(this.latestJudgeStatusInfo).length !==
            Object.keys(fresh).length
        this.latestJudgeStatusInfo = fresh
        if (changed) {
          this._onDidUpdateJudgeStatusInfo.fire()
        }
        return fresh
      },
      OJMetadataService.METADATA_TTL_MINUTES,
    )
  }

  /**
   * Fetches information about programming languages (name, extension).
   * Uses cache with a default TTL.
   * @returns A promise resolving to the LanguageInfo object.
   */
  async getLanguageInfo(): Promise<LanguageInfo> {
    return this.languageInfoCache.getOrFetch(
      OJMetadataService.LANGUAGE_INFO_CACHE_KEY,
      async () => {
        // The API returns the object directly
        return this.apiClient.get<LanguageInfo>('/meta/info/language')
      },
      OJMetadataService.METADATA_TTL_MINUTES,
    )
  }

  /**
   * Fetches the current status of all judge runners.
   * Uses cache with a shorter TTL.
   * @returns A promise resolving to an array of Runner objects.
   */
  async getRunnerStatus(): Promise<Runner[]> {
    return this.RunnerCache.getOrFetch(
      OJMetadataService.RUNNER_STATUS_CACHE_KEY,
      async () => {
        return this.apiClient.get<Runner[]>('/meta/runner-status')
      },
      OJMetadataService.RUNNER_STATUS_TTL_MINUTES,
    )
  }

  /**
   * Clears the cache for judge status information.
   */
  clearJudgeStatusCache(): void {
    this.judgeStatusCache.delete(OJMetadataService.JUDGE_STATUS_CACHE_KEY)
    console.log('Judge status cache cleared.')
  }

  /**
   * Clears the cache for language information.
   */
  clearLanguageInfoCache(): void {
    this.languageInfoCache.delete(OJMetadataService.LANGUAGE_INFO_CACHE_KEY)
    console.log('Language info cache cleared.')
  }

  /**
   * Clears the cache for runner status information.
   */
  clearRunnerCache(): void {
    this.RunnerCache.delete(OJMetadataService.RUNNER_STATUS_CACHE_KEY)
    console.log('Runner status cache cleared.')
  }

  /**
   * Clears all caches managed by this service.
   */
  clearAllCaches(): void {
    this.judgeStatusCache.clear()
    this.languageInfoCache.clear()
    this.RunnerCache.clear()
    console.log('All OJ metadata caches cleared.')
  }

  /**
   * Returns the most recently fetched judge status info if available (no fetch).
   */
  peekJudgeStatusInfo(): JudgeStatusInfo | undefined {
    return this.latestJudgeStatusInfo
  }
}
