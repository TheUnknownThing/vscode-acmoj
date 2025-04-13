import * as vscode from 'vscode'
import { ApiClient } from '../core/api'
import { Profile } from '../types' // Import Profile type

const TOKEN_KEY = 'acmoj_personal_access_token'
const PROFILE_KEY = 'acmoj_user_profile' // Key to store profile in globalState

export class AuthService {
  private _accessToken: string | null = null
  private _isValidated: boolean = false
  private _profile: Profile | null = null // Store user profile

  private _onDidChangeLoginStatus = new vscode.EventEmitter<boolean>()
  public readonly onDidChangeLoginStatus = this._onDidChangeLoginStatus.event

  private _onDidChangeProfile = new vscode.EventEmitter<Profile | null>()
  public readonly onDidChangeProfile = this._onDidChangeProfile.event

  constructor(private context: vscode.ExtensionContext) {
    // Load stored profile first
    this._profile = context.globalState.get<Profile | null>(PROFILE_KEY, null)

    this.loadTokenFromStorage().then((loaded) => {
      this.setContext(loaded)
      if (loaded && !this._profile) {
        // If token exists but profile missing, try fetching
        this.validateTokenAndFetchProfile().catch((err) => {
          console.warn('Initial profile fetch failed:', err)
          // Might indicate invalid token, handleUnauthorizedError will likely be called by API client
        })
      } else if (loaded && this._profile) {
        // Already have token and profile, fire events
        this._onDidChangeLoginStatus.fire(true)
        this._onDidChangeProfile.fire(this._profile)
      }
    })
  }

  private setContext(loggedIn: boolean) {
    vscode.commands.executeCommand('setContext', 'acmoj.loggedIn', loggedIn)
  }

  public isLoggedIn(): boolean {
    return !!this._accessToken
  }

  public async getToken(): Promise<string | null> {
    return this._accessToken
  }

  public getProfile(): Profile | null {
    return this._profile
  }

  /**
   * Prompts the user to enter their Personal Access Token and stores it.
   * Also attempts to validate the token.
   */
  public async setToken(): Promise<boolean> {
    const token = await vscode.window.showInputBox({
      prompt: 'Enter your ACMOJ Personal Access Token',
      password: true, // Mask the input
      ignoreFocusOut: true, // Keep input box open if focus moves
      placeHolder: 'acmoj-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    })

    if (token) {
      const success = await this.storeAndValidateToken(token.trim())
      return success
    } else {
      vscode.window.showInformationMessage('Set token cancelled.')
      return false // User cancelled input
    }
  }

  /**
   * Stores the token and attempts to validate it by fetching user profile.
   * @param token The token to store and validate.
   * @returns True if the token was stored and validated successfully, false otherwise.
   */
  private async storeAndValidateToken(token: string): Promise<boolean> {
    let success = false // Track overall success
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'ACMOJ: Saving and validating token...',
        cancellable: false,
      },
      async (progress) => {
        try {
          // Store the token first
          await this.context.secrets.store(TOKEN_KEY, token)
          this._accessToken = token
          this._isValidated = false
          this._profile = null // Clear old profile

          // Attempt validation and profile fetch
          const profile = await new ApiClient(this).get<Profile>(
            '/user/profile',
          )

          // If validation passes:
          this._isValidated = true
          this._profile = profile // Store fetched profile
          await this.context.globalState.update(PROFILE_KEY, this._profile) // Persist profile

          this.setContext(true)
          this._onDidChangeLoginStatus.fire(true)
          this._onDidChangeProfile.fire(this._profile) // Fire profile change event
          vscode.window.showInformationMessage(
            `ACMOJ Token set for ${profile.friendly_name} (${profile.username})!`,
          )
          success = true // Mark as successful
        } catch (error: any) {
          vscode.window.showErrorMessage(
            `Failed to set or validate token: ${error.message}. Please check the token.`,
          )
          await this.clearTokenInternal() // Clear the invalid token and profile
          // Error will be caught by the outer catch block
          throw error
        }
      },
    )
    return success // Return success status
  }

  /**
   * Clears the stored Personal Access Token.
   */
  public async clearToken(): Promise<void> {
    const wasLoggedIn = this.isLoggedIn()
    await this.clearTokenInternal()
    if (wasLoggedIn) {
      vscode.window.showInformationMessage(
        'ACMOJ Personal Access Token cleared.',
      )
    } else {
      vscode.window.showInformationMessage('No ACMOJ token was set.')
    }
  }

  /** Internal method to clear token without showing messages */
  private async clearTokenInternal(): Promise<void> {
    const wasLoggedIn = this.isLoggedIn()
    this._accessToken = null
    this._isValidated = false
    this._profile = null // Clear profile
    await this.context.secrets.delete(TOKEN_KEY)
    await this.context.globalState.update(PROFILE_KEY, undefined) // Clear persisted profile
    if (wasLoggedIn) {
      this.setContext(false)
      this._onDidChangeLoginStatus.fire(false)
      this._onDidChangeProfile.fire(null) // Fire profile change event
    }
  }

  /** Loads token from storage on startup */
  private async loadTokenFromStorage(): Promise<boolean> {
    try {
      const storedToken = await this.context.secrets.get(TOKEN_KEY)
      const storedProfile = this.context.globalState.get<Profile | null>(
        PROFILE_KEY,
        null,
      ) // Load profile too

      if (storedToken) {
        this._accessToken = storedToken
        this._profile = storedProfile // Use stored profile
        this._isValidated = false // Assume not validated on load
        return true
      }
    } catch (error) {
      console.error('Failed to load token/profile from storage:', error)
      await this.clearTokenInternal()
    }
    return false
  }

  /** New method to explicitly validate and fetch profile */
  public async validateTokenAndFetchProfile(): Promise<Profile | null> {
    if (!this._accessToken) return null
    try {
      const profile = await new ApiClient(this).get<Profile>('/user/profile')
      this._isValidated = true
      this._profile = profile
      await this.context.globalState.update(PROFILE_KEY, this._profile)
      this._onDidChangeProfile.fire(this._profile) // Notify listeners
      return profile
    } catch (error) {
      console.error('Token validation/Profile fetch failed:', error)
      // Let the ApiClient interceptor handle 401 by calling handleUnauthorizedError
      return null
    }
  }

  /**
   * Handles API errors, specifically 401 for invalid tokens.
   * To be called by ApiClient's error interceptor.
   */
  public async handleUnauthorizedError(): Promise<void> {
    const currentToken = this._accessToken // Get token before clearing
    await this.clearTokenInternal() // Clear the invalid token
    if (currentToken) {
      // Only show message if a token was actually set
      vscode.window
        .showErrorMessage(
          'ACMOJ: Invalid or expired Personal Access Token. Please set a new token.',
          'Set Token',
        )
        .then((selection) => {
          if (selection === 'Set Token') {
            vscode.commands.executeCommand('acmoj.setToken')
          }
        })
    }
  }

  /**
   * Check login status, if not, prompt user to set tokens
   * @returns True if user is logged in.
   */
  public async checkLoginAndPrompt(): Promise<boolean> {
    if (!this.isLoggedIn()) {
      const selection = await vscode.window.showWarningMessage(
        'Please set your ACMOJ Personal Access Token first.',
        'Set Token',
        'Cancel',
      )
      if (selection === 'Set Token') {
        await vscode.commands.executeCommand('acmoj.setToken')
        return this.isLoggedIn()
      }
      return false
    }
    return true
  }

  dispose() {
    this._onDidChangeLoginStatus.dispose()
  }
}
