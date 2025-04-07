import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios'
import * as vscode from 'vscode'
import * as https from 'https'
import { AuthService } from './auth'
import { ApiError } from '../types'

export class ApiClient {
  private axiosInstance: AxiosInstance
  private authService: AuthService
  private retryCount: number
  private retryDelay: number
  private baseUrl: string

  constructor(authService: AuthService) {
    this.authService = authService

    const config = vscode.workspace.getConfiguration('acmoj')
    this.baseUrl = config.get<string>('baseUrl', 'https://acm.sjtu.edu.cn')
    const apiBasePath = config.get<string>('apiBasePath', '/OnlineJudge/api/v1')
    this.retryCount = config.get<number>('apiRetryCount', 3)
    this.retryDelay = config.get<number>('apiRetryDelay', 1000)
    const requestTimeout = config.get<number>('apiRequestTimeout', 15000)

    const httpsAgent = new https.Agent({
      rejectUnauthorized: true,
      keepAlive: true,
      timeout: requestTimeout,
    })

    this.axiosInstance = axios.create({
      baseURL: `${this.baseUrl}${apiBasePath}`,
      headers: {
        Accept: 'application/json',
      },
      timeout: requestTimeout,
      timeoutErrorMessage: `Request timed out after ${requestTimeout}ms. Please try again.`,
      httpsAgent,
      maxRedirects: 5,
    })

    // Request interceptor - Adds the token
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        const token = await this.authService.getToken()
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`
        }
        return config
      },
      (error) => {
        console.error('Request Interceptor Error:', error)
        return Promise.reject(error)
      },
    )

    // Response interceptor - Handles generic errors and 401
    this.axiosInstance.interceptors.response.use(
      (response) => {
        return response
      },
      async (error: AxiosError<ApiError>) => {
        const originalRequest = error.config
        const status = error.response?.status

        // Network/Connectivity Errors
        if (
          (error.code &&
            [
              'ECONNREFUSED',
              'ENOTFOUND',
              'ETIMEDOUT',
              'ERR_TLS_CERT_ALTNAME_INVALID',
            ].includes(error.code)) ||
          error.message.includes('timeout') ||
          error.message.includes('socket') ||
          error.message.includes('TLS')
        ) {
          console.error(
            `Network/TLS error for ${originalRequest?.url}:`,
            error.message,
            error.code,
          )
          // Don't reject here, let retry handle it first if applicable
          // return Promise.reject(new Error(userMessage));
        }

        // Unauthorized Error
        if (status === 401 && originalRequest) {
          console.warn(
            `API request unauthorized (401) for ${originalRequest.url}. Invalidating token.`,
          )
          // Avoid infinite loops if token refresh itself fails

          await this.authService.handleUnauthorizedError()
          // Reject immediately, no retry for 401
          return Promise.reject(
            new Error(
              'Authentication failed (401). Please check your Personal Access Token.',
            ),
          )
        }

        // Extract API error message if available
        const apiErrorMessage = error.response?.data?.message || error.message
        // We don't reject here directly; let the retry logic handle it.
        // The final error thrown by requestWithRetry will use this message.
        // Create a new error object to preserve the status code if available
        const customError = new Error(apiErrorMessage) as any
        customError.status = status
        customError.originalError = error
        return Promise.reject(customError)
      },
    )
  }

  // Centralized request method with retry logic
  public async request<T>(config: AxiosRequestConfig): Promise<T> {
    let lastError: any = null // Use 'any' to capture custom error properties
    let attempt = 0

    while (attempt <= this.retryCount) {
      // Use <= to allow initial attempt + retryCount retries
      try {
        const response = await this.axiosInstance.request<T>(config)
        return response.data
      } catch (error: any) {
        lastError = error
        const status = error.status || error.originalError?.response?.status // Get status from our custom error or original AxiosError

        // Conditions to NOT retry:
        // 1. Client-side errors (4xx) except for potential transient ones like 408 (Timeout) or 429 (Too Many Requests)
        // 2. Specific non-retryable conditions (e.g., explicit instruction from error)
        if (status) {
          if (status === 401) break // Already handled by interceptor, definitely don't retry
          if (
            status >= 400 &&
            status < 500 &&
            status !== 408 &&
            status !== 429
          ) {
            // Don't retry most client errors (like 400, 403, 404)
            break
          }
        }

        attempt++
        if (attempt <= this.retryCount) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1) // Exponential backoff
          console.warn(
            `Request failed (Attempt ${attempt}/${this.retryCount}): ${error.message}. Retrying in ${delay}ms... [${config.method?.toUpperCase()} ${config.url}]`,
          )
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }
    }

    console.error(
      `Request failed after ${attempt} attempts: ${lastError.message} [${config.method?.toUpperCase()} ${config.url}]`,
      lastError.originalError || lastError,
    )
    // Throw the last captured error
    throw lastError
  }

  // Convenience methods
  public get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.request<T>({ ...config, method: 'GET', url })
  }

  public post<T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    return this.request<T>({ ...config, method: 'POST', url, data })
  }

  public put<T>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    return this.request<T>({ ...config, method: 'PUT', url, data })
  }

  public delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.request<T>({ ...config, method: 'DELETE', url })
  }

  // Method to get the base URL (needed for constructing absolute URLs like codeUrl)
  public getBaseUrl(): string {
    return this.baseUrl
  }
}
