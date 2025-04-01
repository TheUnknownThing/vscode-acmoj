import axios, { AxiosInstance, AxiosError } from 'axios'
import * as vscode from 'vscode'
import { AuthService } from './auth'
import {
  ProblemBrief,
  Problem,
  SubmissionBrief,
  Submission,
  ApiError,
  Profile,
  Problemset,
} from './types'
import * as querystring from 'querystring'
import * as https from 'https'
import { CacheService } from './cache'

export class ApiClient {
  private axiosInstance: AxiosInstance
  private authService: AuthService
  private cacheService: CacheService
  private retryCount: number = 3
  private retryDelay: number = 1000

  constructor(authService: AuthService) {
    this.authService = authService
    this.cacheService = new CacheService(15) // Default 15 minutes TTL

    const config = vscode.workspace.getConfiguration('acmoj')
    const baseUrl = config.get<string>('baseUrl', 'https://acm.sjtu.edu.cn')

    // Get retry settings from configuration
    this.retryCount = config.get<number>('apiRetryCount', 3)
    this.retryDelay = config.get<number>('apiRetryDelay', 1000)

    const httpsAgent = new https.Agent({
      rejectUnauthorized: true,
      keepAlive: true,
      timeout: 15000,
    })

    this.axiosInstance = axios.create({
      baseURL: `${baseUrl}/OnlineJudge/api/v1`,
      headers: {
        Accept: 'application/json',
      },
      timeout: 15000,
      timeoutErrorMessage: 'Request timed out. Please try again.',
      httpsAgent,
      maxRedirects: 5,
    })

    // Request interceptor - GETS THE TOKEN
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        const token = await this.authService.getToken()
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`
        }
        return config
      },
      (error) => {
        return Promise.reject(error)
      },
    )

    // Response interceptor - HANDLES ERRORS
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<ApiError>) => {
        const originalRequest = error.config

        // Detect TLS/socket connection issues
        if (
          error.message &&
          (error.message.includes('socket') ||
            error.message.includes('TLS') ||
            error.message.includes('ECONNREFUSED') ||
            error.message.includes('ENOTFOUND') ||
            error.message.includes('timeout'))
        ) {
          console.error('TLS/Socket connection error:', error.message)

          return Promise.reject(
            new Error(
              `Network connectivity issue: ${error.message}. Try checking your network connection or VPN settings.`,
            ),
          )
        }

        if (error.response?.status === 401 && originalRequest) {
          console.warn('API request unauthorized (401). Invalidating token.')
          await this.authService.handleUnauthorizedError()
          return Promise.reject(
            new Error('Invalid or expired token. Please set a new one.'),
          )
        }
        // rest of error handling
        const apiErrorMessage = error.response?.data?.message || error.message
        return Promise.reject(new Error(apiErrorMessage))
      },
    )
  }

  // Request method with retry mechanism
  private async requestWithRetry<T>(
    method: string,
    url: string,
    options: any = {},
  ): Promise<T> {
    let lastError: Error | null = null
    let attempt = 0

    while (attempt < this.retryCount) {
      try {
        let response
        if (method.toLowerCase() === 'get') {
          response = await this.axiosInstance.get(url, options)
        } else if (method.toLowerCase() === 'post') {
          response = await this.axiosInstance.post(
            url,
            options.data,
            options.config,
          )
        }
        return response?.data
      } catch (error: any) {
        lastError = error

        // Don't retry for 401 errors or other specific client errors
        if (
          error.response?.status === 401 ||
          (error.response?.status >= 400 && error.response?.status < 500)
        ) {
          break
        }

        attempt++
        if (attempt < this.retryCount) {
          // Wait before retrying
          await new Promise((resolve) =>
            setTimeout(resolve, this.retryDelay * attempt),
          )
          console.log(`Request retry ${attempt}/${this.retryCount}: ${url}`)
        }
      }
    }

    throw (
      lastError ||
      new Error('Request failed, please check your network connection')
    )
  }

  // Clear all cache
  clearCache() {
    this.cacheService.clear()
    console.log('All cache cleared')
  }

  // Get cache service instance
  getCacheService(): CacheService {
    return this.cacheService
  }

  // Set cache TTL
  setCacheTTL(ttlMinutes: number) {
    this.cacheService = new CacheService(ttlMinutes)
  }

  // --- Problem Endpoints ---

  async getProblems(
    cursor?: string,
    keyword?: string,
    problemsetId?: number,
  ): Promise<{ problems: ProblemBrief[]; next: string | null }> {
    const cacheKey = `problems:${cursor || ''}:${keyword || ''}:${problemsetId || ''}`

    return this.cacheService.getOrFetch(
      cacheKey,
      async () => {
        const params: Record<string, any> = {}
        if (cursor) params.cursor = cursor
        if (keyword) params.keyword = keyword
        if (problemsetId) params.problemset_id = problemsetId

        const response = await this.requestWithRetry<{
          problems: ProblemBrief[]
          next: string | null
        }>('get', '/problem/', { params })
        return response
      },
      5,
    ) // Cache for 5 minutes
  }

  async getProblemDetails(problemId: number): Promise<Problem> {
    const cacheKey = `problem:${problemId}`

    return this.cacheService.getOrFetch(
      cacheKey,
      async () => {
        const response = await this.requestWithRetry<Problem>(
          'get',
          `/problem/${problemId}`,
        )
        return response
      },
      30,
    ) // Cache for 30 minutes, problem content rarely changes
  }

  // --- Problemset Endpoints ---

  async getUserProblemsets(): Promise<{ problemsets: Problemset[] }> {
    const cacheKey = `user:problemsets`

    return this.cacheService.getOrFetch(
      cacheKey,
      async () => {
        const response = await this.requestWithRetry<{
          problemsets: Problemset[]
        }>('get', '/user/problemsets')
        return response
      },
      15,
    ) // Cache for 15 minutes
  }

  async getProblemsetDetails(problemsetId: number): Promise<Problemset> {
    const cacheKey = `problemset:${problemsetId}`

    return this.cacheService.getOrFetch(
      cacheKey,
      async () => {
        const response = await this.requestWithRetry<Problemset>(
          'get',
          `/problemset/${problemsetId}`,
        )
        return response
      },
      20,
    ) // Cache for 20 minutes
  }

  // --- Submission Endpoints ---

  async submitCode(
    problemId: number,
    language: string,
    code: string,
    isPublic: boolean = false,
  ): Promise<{ id: number }> {
    const response = await this.requestWithRetry<{ id: number }>(
      'post',
      `/problem/${problemId}/submit`,
      {
        data: querystring.stringify({ language, code, public: isPublic }),
        config: {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      },
    )

    // Clear submission cache because there is a new submission
    this.clearSubmissionsCache()

    return response
  }

  async getSubmissions(
    cursor?: string,
    username?: string,
    problemId?: number,
    status?: string,
    lang?: string,
  ): Promise<{ submissions: SubmissionBrief[]; next: string | null }> {
    const cacheKey = `submissions:${cursor || ''}:${username || ''}:${problemId || ''}:${status || ''}:${lang || ''}`

    return this.cacheService.getOrFetch(
      cacheKey,
      async () => {
        const params: Record<string, any> = {}
        if (cursor) params.cursor = cursor
        if (username) params.username = username
        if (problemId) params.problem_id = problemId
        if (status) params.status = status
        if (lang) params.lang = lang

        const response = await this.requestWithRetry<{
          submissions: SubmissionBrief[]
          next: string | null
        }>('get', '/submission/', { params })
        return response
      },
      2,
    ) // Cache for only 2 minutes, submission status changes quickly
  }

  async expireSubmissionCache(submissionId: number): Promise<void> {
    const cacheKey = `submission:${submissionId}`
    this.cacheService.delete(cacheKey)
  }

  async getSubmissionDetails(submissionId: number): Promise<Submission> {
    const cacheKey = `submission:${submissionId}`

    return this.cacheService.getOrFetch(
      cacheKey,
      async () => {
        const response = await this.requestWithRetry<Submission>(
          'get',
          `/submission/${submissionId}`,
        )
        return response
      },
      5,
    ) // Cache for 5 minutes
  }

  async getSubmissionCode(codeUrl: string): Promise<string> {
    const cacheKey = `submissionCode:${codeUrl}`

    return this.cacheService.getOrFetch(
      cacheKey,
      async () => {
        try {
          const response = await axios.get<string>(codeUrl, {
            baseURL: this.axiosInstance.defaults.baseURL?.replace(
              '/api/v1',
              '',
            ),
          })
          return response.data
        } catch (error) {
          console.error(`Failed to fetch code from ${codeUrl}:`, error)
          throw new Error('Failed to fetch submission code.')
        }
      },
      30,
    ) // Cache for 30 minutes, code content doesn't change
  }

  async abortSubmission(submissionId: number): Promise<void> {
    // No cache, direct operation
    await this.requestWithRetry<void>(
      'post',
      `/submission/${submissionId}/abort`,
    )

    // Clear submission cache
    this.clearSubmissionsCache()
    this.cacheService.delete(`submission:${submissionId}`)
  }

  private clearSubmissionsCache() {
    // Delete all cache entries that start with 'submissions:'
    this.cacheService.deleteWithPrefix('submissions:')
    // Delete all cache entries that start with 'submission:'
    this.cacheService.deleteWithPrefix('submission:')
  }

  // --- User Endpoints ---
  async getUserProfile(): Promise<Profile> {
    const cacheKey = 'user:profile'

    return this.cacheService.getOrFetch(
      cacheKey,
      async () => {
        const response = await this.requestWithRetry<Profile>(
          'get',
          '/user/profile',
        )
        return response
      },
      15,
    ) // Cache for 15 minutes
  }

  // --- Course Endpoints ---
  // TODO: Implement course endpoints.
}
