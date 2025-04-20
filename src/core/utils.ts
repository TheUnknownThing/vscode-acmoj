import * as vscode from 'vscode'

// Simple HTML escaping
export function escapeHtml(unsafe: string | null | undefined): string {
  if (unsafe === null || unsafe === undefined) return ''
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/%/g, '&percnt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// Generate a nonce
export function getNonce(): string {
  let text = ''
  const possible =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length))
  }
  return text
}

// Map language string to VSCode language ID
export function mapLanguageToVscode(language: string): string {
  const languageMap: Record<string, string> = {
    cpp: 'cpp',
    'c++': 'cpp',
    c: 'c',
    java: 'java',
    python: 'python',
    python2: 'python',
    python3: 'python',
    javascript: 'javascript',
    js: 'javascript',
    typescript: 'typescript',
    ts: 'typescript',
    csharp: 'csharp',
    'c#': 'csharp',
    php: 'php',
    ruby: 'ruby',
    go: 'go',
    rust: 'rust',
    scala: 'scala',
    kotlin: 'kotlin',
    swift: 'swift',
    pascal: 'pascal',
    fortran: 'fortran',
    haskell: 'haskell',
    verilog: 'verilog',
    plaintext: 'plaintext',
    git: 'plaintext',
  }
  return languageMap[language?.toLowerCase()] || 'plaintext'
}

// Get file extension
export function getFileExtension(languageId: string): string {
  const extensionMap: Record<string, string> = {
    cpp: 'cpp',
    c: 'c',
    java: 'java',
    python: 'py',
    javascript: 'js',
    typescript: 'ts',
    csharp: 'cs',
    php: 'php',
    ruby: 'rb',
    go: 'go',
    rust: 'rs',
    scala: 'scala',
    kotlin: 'kt',
    swift: 'swift',
    pascal: 'pas',
    fortran: 'f',
    haskell: 'hs',
    verilog: 'v',
    plaintext: 'txt',
  }
  return extensionMap[languageId] || 'txt'
}

// Open code in a new editor
export async function openCodeInEditor(
  code: string,
  language: string,
  title: string, // e.g., "Submission 123 - Problem 456"
): Promise<void> {
  if (!code) {
    vscode.window.showErrorMessage('Cannot open empty code in editor.')
    return
  }
  try {
    const languageId = mapLanguageToVscode(language)
    const doc = await vscode.workspace.openTextDocument({
      content: code,
      language: languageId,
    })
    await vscode.window.showTextDocument(doc, { preview: false })
    vscode.window.showInformationMessage(
      `Opened code for "${title}" in a new editor.`,
    )
  } catch (error: unknown) {
    let message = 'Unknown error'
    if (error instanceof Error) {
      message = error.message
    }
    vscode.window.showErrorMessage(`Failed to open code in editor: ${message}`)
  }
}
