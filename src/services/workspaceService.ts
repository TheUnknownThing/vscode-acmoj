import * as vscode from 'vscode'
import * as path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { mapLanguageToVscode, getFileExtension } from '../core/utils'

const execAsync = promisify(exec)

export class WorkspaceService {
  getActiveEditor(): vscode.TextEditor | undefined {
    return vscode.window.activeTextEditor
  }

  getActiveDocument(): vscode.TextDocument | undefined {
    return vscode.window.activeTextEditor?.document
  }

  async openCodeInEditor(
    code: string,
    language: string,
    submissionId: number,
  ): Promise<void> {
    if (!code) {
      throw new Error('Code content is empty or not available.')
    }

    const languageId = mapLanguageToVscode(language)

    const doc = await vscode.workspace.openTextDocument({
      content: code,
      language: languageId,
    })

    await vscode.window.showTextDocument(doc)

    vscode.window.showInformationMessage(
      `Opened code for submission #${submissionId} in ${languageId} editor.`,
    )
  }

  async saveActiveDocument(): Promise<boolean> {
    const document = this.getActiveDocument()
    if (document && document.isDirty) {
      return await document.save()
    }
    return true // Already saved or no document
  }

  async ensureDocumentHasProblemIdComment(
    document: vscode.TextDocument,
    problemId: number,
    languageId: string,
  ): Promise<void> {
    const firstLine = document.lineAt(0).text
    const commentRegex = /(?:^\s*(?:\/\/|#)\s*acmoj:)\s*(\d+)/
    const match = firstLine.match(commentRegex)

    let existingId: number | null = null
    if (match && match[1]) {
      existingId = parseInt(match[1], 10)
    }

    if (existingId === problemId) {
      return // Already correct
    }

    const langCommentMap: Record<string, string> = {
      cpp: '//',
      python: '#',
      java: '//',
      c: '//',
      verilog: '//',
      javascript: '//',
      typescript: '//',
      // Add other languages supported by your OJ
    }
    const commentPrefix = langCommentMap[languageId]

    if (!commentPrefix) {
      console.warn(
        `No comment prefix defined for language ${languageId}. Cannot add problem ID comment.`,
      )
      return // Cannot add comment for this language
    }

    const newCommentLine = `${commentPrefix} acmoj: ${problemId}\n`
    const edit = new vscode.WorkspaceEdit()

    if (match) {
      // Replace existing comment
      const range = new vscode.Range(0, 0, 0, firstLine.length)
      edit.replace(document.uri, range, newCommentLine.trim()) // Use trim if replacing inline
    } else {
      // Insert new comment at the beginning
      edit.insert(document.uri, new vscode.Position(0, 0), newCommentLine)
    }

    const success = await vscode.workspace.applyEdit(edit)
    if (success) {
      // Maybe save the document after edit? Optional.
      // await document.save();
    } else {
      vscode.window.showErrorMessage(
        'Failed to add problem ID comment to the file.',
      )
    }
  }

  extractProblemIdFromText(text: string): number | undefined {
    const firstLine = text.split('\n', 1)[0].trim()
    const match = firstLine.match(/(?:\/\/|#)\s*acmoj:\s*(\d+)/)
    if (match && match[1]) {
      return parseInt(match[1], 10)
    }
    return undefined
  }

  extractProblemIdFromFileName(filePath: string): number | undefined {
    const fileName = path.basename(filePath)
    // Regex tries to find numbers preceded by P or nothing, followed by non-digit or end
    // Examples: P123.cpp, 123_solution.py, 123.java
    const match = fileName.match(/(?:\b|_|^)P?(\d+)(?:\b|_|\.[^.]*$)/)
    if (match && match[1]) {
      return parseInt(match[1], 10)
    }
    return undefined
  }

  async getGitRemoteFetchUrls(folderPath?: string): Promise<string[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders
    let repoPath = folderPath

    if (!repoPath) {
      if (workspaceFolders && workspaceFolders.length > 0) {
        // Default to the first workspace folder if no specific path given
        repoPath = workspaceFolders[0].uri.fsPath
      } else {
        vscode.window.showWarningMessage(
          'Cannot determine Git repository path. No folder open.',
        )
        return []
      }
    }

    const command = 'git remote -v'
    const options = { cwd: path.resolve(repoPath) }
    const fetchUrls = new Set<string>()

    try {
      const { stdout, stderr } = await execAsync(command, options)

      if (stderr && !stderr.toLowerCase().includes('warning')) {
        console.warn(`Git stderr from ${repoPath}: ${stderr.trim()}`)
      }
      if (!stdout) return []

      const lines = stdout.trim().split('\n')
      const lineRegex = /^\S+\s+(\S+)\s+\(fetch\)$/

      for (const line of lines) {
        const match = line.match(lineRegex)
        if (match && match[1]) fetchUrls.add(match[1])
      }
      return Array.from(fetchUrls)
    } catch (error: any) {
      if (
        error.stderr?.toLowerCase().includes('not a git repository') ||
        error.message?.toLowerCase().includes('not a git repository')
      ) {
        console.log(`Directory "${repoPath}" is not a Git repository.`)
        return []
      } else if (error.code === 'ENOENT') {
        vscode.window.showErrorMessage(
          `'git' command not found. Make sure Git is installed and in your system's PATH.`,
        )
        return [] // Or throw? Depending on how critical git is.
      } else {
        console.error(`Error executing 'git remote -v' in ${repoPath}:`, error)
        vscode.window.showErrorMessage(
          `Failed to list Git remotes: ${error.stderr || error.message}`,
        )
        return [] // Or throw?
      }
    }
  }

  mapLanguageIdToOJFormat(
    vscodeLangId: string,
    availableLangs: string[],
  ): string | undefined {
    const lowerId = vscodeLangId.toLowerCase()

    // Direct mapping (common cases)
    const directMap: Record<string, string> = {
      cpp: 'cpp',
      'c++': 'cpp',
      c: 'c',
      java: 'java',
      python: 'python',
      javascript: 'javascript',
      typescript: 'typescript',
      verilog: 'verilog', // Add mappings relevant to your OJ
    }

    let potentialMatch: string | undefined = directMap[lowerId]

    // Handle special cases like 'plaintext' -> 'git' if applicable
    if (lowerId === 'plaintext' && availableLangs.includes('git')) {
      potentialMatch = 'git'
    }

    // Check if the potential match is actually available for the problem
    if (potentialMatch && availableLangs.includes(potentialMatch)) {
      return potentialMatch
    }

    // Fallback: maybe the vscodeLangId itself is the OJ language ID?
    if (availableLangs.includes(lowerId)) {
      return lowerId
    }

    // If no match found
    return undefined
  }
}
