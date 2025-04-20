# Contributing to the VS Code ACMOJ Helper Extension

First off, thank you for considering contributing! We welcome any help to make this extension better for everyone using ACMOJ within VS Code. Whether it's reporting a bug, proposing a feature, or writing code, your contribution is valuable.

This document provides guidelines for contributing to this project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Enhancements](#suggesting-enhancements)
  - [Your First Code Contribution](#your-first-code-contribution)
  - [Pull Requests](#pull-requests)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Coding Style](#coding-style)
- [Testing](#testing)

## Code of Conduct

This project and everyone participating in it are governed by the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior.

## How Can I Contribute?

### Reporting Bugs

If you find a bug, please ensure the bug was not already reported by searching on GitHub under [Issues](https://github.com/TheUnknownThing/vscode-acmoj/issues).

If you're unable to find an open issue addressing the problem, [open a new one](https://github.com/TheUnknownThing/vscode-acmoj/issues/new). Be sure to include:

- A **clear and descriptive title**.
- The **version of VS Code** you're using.
- The **version of this extension** you're using.
- **Steps to reproduce** the behavior.
- What you **expected to see** and what you **actually saw**.
- Relevant **screenshots** or error messages from the VS Code Developer Tools (`Help > Toggle Developer Tools`).

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues.

- Search the [issues](https://github.com/TheUnknownThing/vscode-acmoj/issues) to see if the enhancement has already been suggested.
- If not, [open a new issue](https://github.com/TheUnknownThing/vscode-acmoj/issues/new).
- Provide a **clear and descriptive title**.
- Explain the **motivation** for the enhancement (what problem does it solve?).
- Provide a **step-by-step description** of the suggested enhancement in as much detail as possible.
- Explain **why this enhancement would be useful** to most users.

### Your First Code Contribution

Unsure where to begin? Look for issues tagged `good first issue` or `help wanted`. These are usually smaller, well-defined tasks suitable for getting started.

### Pull Requests

1.  **Fork** the repository on GitHub.
2.  **Clone** your fork locally: `git clone https://github.com/your-username/vscode-acmoj.git`
3.  **Create a branch** for your local development: `git checkout -b my-new-feature` or `git checkout -b fix/bug-name`. Use a descriptive branch name.
4.  **Make your changes** locally.
5.  **Test your changes** thoroughly (see [Testing](#testing)).
6.  **Commit your changes** using a clear and descriptive commit message. Consider using [Conventional Commits](https://www.conventionalcommits.org/) format (e.g., `feat: Add problemset filtering`, `fix: Correct equation rendering`).
7.  **Push your branch** to your fork: `git push origin my-new-feature`.
8.  **Open a Pull Request (PR)** from your fork's branch to the `main` (or `master`) branch of the original repository.
9.  **Provide a clear description** of your PR, explaining the changes and linking to the relevant issue number (e.g., `Closes #123`).
10. Be prepared to **discuss your changes** and make adjustments based on feedback.

## Development Setup

To get the extension running locally for development:

1.  **Prerequisites:**
    - [Node.js](https://nodejs.org/) (LTS version recommended, e.g., >= 18.x)
    - `npm` (comes with Node.js) or `yarn`
    - [Git](https://git-scm.com/)
    - [Visual Studio Code](https://code.visualstudio.com/) (latest stable version recommended)
2.  **Clone your fork:** `git clone https://github.com/your-username/vscode-acmoj.git`
3.  **Navigate to the project directory:** `cd vscode-acmoj`
4.  **Install dependencies:** `npm install` or `yarn install`
5.  **Open the project in VS Code:** `code .`
6.  **Compile TypeScript (optional, happens automatically on debug):** `npm run compile` or `npm run watch` for continuous compilation.
7.  **Start Debugging:** Press `F5` or go to the "Run and Debug" view (Ctrl+Shift+D) and click the green play button for "Run Extension". This will:
    - Compile the TypeScript code (if needed).
    - Open a new VS Code window (the **Extension Development Host**) with your extension loaded and running.

You can now use the extension in the Extension Development Host window and set breakpoints, inspect variables, etc., in the original VS Code window where you launched the debugger.

## Project Structure

Here's an overview of the project files and directories:

```
.
├── .vscode/                  # VS Code specific settings (launch.json, tasks.json)
├── node_modules/             # Project dependencies
├── out/                      # Compiled JavaScript output (from src/)
├── static/                   # Static assets (images, gifs)
├── src/                      # TypeScript source code
│   ├── extension.ts          # Main activation/deactivation point
│   ├── types.ts              # TypeScript interfaces and types
│   ├── commands/             # Command registrations and implementations
│   │   ├── authCommands.ts
│   │   ├── filterCommands.ts
│   │   ├── index.ts
│   │   ├── problemCommands.ts
│   │   └── submissionCommands.ts
│   ├── core/                 # Core utilities and API/auth logic
│   │   ├── api.ts
│   │   ├── auth.ts
│   │   └── utils.ts
│   ├── services/             # Data fetching logic and data handling
│   │   ├── cacheService.ts
│   │   ├── problemService.ts
│   │   ├── problemsetService.ts
│   │   ├── submissionMonitorService.ts
│   │   ├── submissionService.ts
│   │   ├── userService.ts
│   │   └── workspaceService.ts
│   ├── views/                # Tree Data Providers for side panel views
│   │   ├── problemsetProvider.ts
│   │   └── submissionProvider.ts
│   └── webviews/             # Webview panels for problem/submission details
│       ├── problemDetailPanel.ts
│       ├── submissionDetailPanel.ts
│       └── webviewBase.ts
├── .gitignore                # Files ignored by Git
├── .vscodeignore             # Files ignored when packaging the extension
├── CHANGELOG.md              # Log of changes per version
├── CODE_OF_CONDUCT.md        # Code of Conduct for contributors
├── LICENSE                   # License for the project
├── CONTRIBUTING.md           # This file!
├── package.json              # Extension manifest (metadata, dependencies, contributions, activation)
├── README.md                 # Extension documentation for users
└── tsconfig.json             # TypeScript compiler configuration
```

- **`package.json`** defines how the extension integrates with VS Code (commands, views, configuration, activation events).
- **`src/extension.ts`** is the entry point where services are initialized and features are registered.
- Most user-facing features involve **registering a command** (`src/commands/`), **fetching the data** (`src/services/`), and **displaying information in tree-views** (`src/views/`) or **webviews** (`src/webviews/`).

## Coding Style

- **Language:** TypeScript. Please follow standard TypeScript best practices.
- **Linter/Formatter:** We use ESLint and potentially Prettier (check `.eslintrc.js` and `.prettierrc.js`). Please run `npm run lint` and/or `npm run format` before committing. Ensure your editor is configured to use these tools.
- **VS Code API:**
  - Use the official `vscode` API module.
  - Properly manage disposables by adding them to `context.subscriptions` in `activate` or managing them within specific components (like WebviewPanels).
  - Use asynchronous operations (`async`/`await`) appropriately, especially for API calls and VS Code UI interactions that return `Thenable`.
- **Error Handling:** Use `try...catch` for operations that might fail (like API calls). Provide informative error messages to the user using `vscode.window.showErrorMessage`. Log detailed errors to the console for debugging (`console.error`).
- **Comments:** Add comments to explain complex logic or non-obvious code sections. Use TSDoc comments for exported functions and classes.

## Testing

Currently, testing is primarily done **manually** using the Extension Development Host (`F5`):

1.  Launch the extension via `F5`.
2.  In the new window:
    - Test the login/logout flow (`Set Personal Access Token`, `Clear Personal Access Token`).
    - Verify the status bar updates correctly.
    - Test refreshing and navigating the Problemset and Submission views.
    - Test opening problem details (check Markdown and KaTeX rendering).
    - Test opening submission details.
    - Test submitting code from the editor or problem view.
    - Test aborting submissions (if applicable).
    - Test edge cases (invalid token, API errors, empty lists, invalid problem IDs).

- **Unit/Integration Tests:** If tests are added using `@vscode/test-electron`, they can be run via `npm test`. Please add tests for new features or bug fixes where appropriate.

---

Thank you again for your interest in contributing!
