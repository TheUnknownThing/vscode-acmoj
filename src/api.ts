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

export class ApiClient {
  private axiosInstance: AxiosInstance
  private authService: AuthService

  constructor(authService: AuthService) {
    this.authService = authService
    const config = vscode.workspace.getConfiguration('acmoj')
    const baseUrl = config.get<string>('baseUrl', 'https://acm.sjtu.edu.cn')

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
  // --- Problem Endpoints ---

  async getProblems(
    cursor?: string,
    keyword?: string,
    problemsetId?: number,
  ): Promise<{ problems: ProblemBrief[]; next: string | null }> {
    const params: Record<string, any> = {}
    if (cursor) params.cursor = cursor
    if (keyword) params.keyword = keyword
    if (problemsetId) params.problemset_id = problemsetId

    const response = await this.axiosInstance.get<{
      problems: ProblemBrief[]
      next: string | null
    }>('/problem/', { params })
    return response.data
  }

  async getProblemDetails(problemId: number): Promise<Problem> {
    const response = await this.axiosInstance.get<Problem>(
      `/problem/${problemId}`,
    )
    return response.data
  }

  // --- Problemset Endpoints ---

  async getUserProblemsets(): Promise<{ problemsets: Problemset[] }> {
    // API spec shows /user/problemsets returns { problemsets: [...] }
    const response = await this.axiosInstance.get<{
      problemsets: Problemset[]
    }>('/user/problemsets')
    return response.data
  }

  async getProblemsetDetails(problemsetId: number): Promise<Problemset> {
    const response = await this.axiosInstance.get<Problemset>(
      `/problemset/${problemsetId}`,
    )
    return response.data
  }

  // --- Submission Endpoints ---

  async submitCode(
    problemId: number,
    language: string,
    code: string,
    isPublic: boolean = false,
  ): Promise<{ id: number }> {
    const response = await this.axiosInstance.post<{ id: number }>(
      `/problem/${problemId}/submit`,
      querystring.stringify({ language, code, public: isPublic }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    )
    return response.data
  }

  async getSubmissions(
    cursor?: string,
    username?: string,
    problemId?: number,
    status?: string,
    lang?: string,
  ): Promise<{ submissions: SubmissionBrief[]; next: string | null }> {
    const params: Record<string, any> = {}
    if (cursor) params.cursor = cursor
    if (username) params.username = username
    if (problemId) params.problem_id = problemId
    if (status) params.status = status
    if (lang) params.lang = lang

    const response = await this.axiosInstance.get<{
      submissions: SubmissionBrief[]
      next: string | null
    }>('/submission/', { params })
    return response.data
  }

  async getSubmissionDetails(submissionId: number): Promise<Submission> {
    const response = await this.axiosInstance.get<Submission>(
      `/submission/${submissionId}`,
    )
    return response.data
  }

  async getSubmissionCode(codeUrl: string): Promise<string> {
    try {
      const response = await axios.get<string>(codeUrl, {
        baseURL: this.axiosInstance.defaults.baseURL?.replace('/api/v1', ''),
      })
      return response.data
    } catch (error) {
      console.error(`Failed to fetch code from ${codeUrl}:`, error)
      throw new Error('Failed to fetch submission code.')
    }
  }

  async abortSubmission(submissionId: number): Promise<void> {
    // API returns 204 on No Content
    await this.axiosInstance.post(`/submission/${submissionId}/abort`)
  }

  // --- User Endpoints ---
  async getUserProfile(): Promise<Profile> {
    // Return specific Profile type
    const response = await this.axiosInstance.get<Profile>('/user/profile')
    return response.data
  }

  // --- Course Endpoints ---
  // TODO: Implement course endpoints.
}
