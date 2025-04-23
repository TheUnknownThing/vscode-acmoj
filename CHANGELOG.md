# Changelog

All notable changes to the "vscode-acmoj" extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Initial Release Features:**
  - Authentication using ACMOJ Personal Access Token (PAT).
  - Command `ACMOJ: Set Personal Access Token` to securely store the token.
  - Command `ACMOJ: Clear Personal Access Token` to remove the stored token.
  - Status bar item displaying login status and logged-in user's friendly name/username.
  - Command `ACMOJ: Show My Profile` accessible via status bar click (when logged in) or command palette.
  - Activity Bar container with "ACMOJ" icon.
  - Tree View: "Problemsets" - Lists contests and homework the user has joined.
    - Expandable problemsets to show included problems.
    - Clicking a problem opens its details in a Webview.
    - Refresh button for the problemset list.
  - Tree View: "My Submissions" - Lists the user's recent submissions.
    - Displays submission ID, problem, status, language, and time.
    - Uses icons to indicate submission status (Accepted, Wrong Answer, Pending, etc.).
    - Clicking a submission opens its details (including code, if accessible) in a Webview.
    - Refresh button for the submission list.
  - Webview for viewing Problem details (description, input/output formats, examples).
  - Webview for viewing Submission details (status, score, resources, message, code).
  - Command `ACMOJ: View Problem by ID...` to open a specific problem's details via input prompt.
  - Command `ACMOJ: Submit Current File` (available via command palette and editor title bar button) to submit the code in the active editor.
    - Prompts for Problem ID if not triggered from a specific context.
    - Prompts user to select the submission language from available options for the problem.
  - Basic error handling for API requests and token validation.
  - Configuration setting `acmoj.baseUrl`.

## [0.1.0] - 2025-03-29

### Added

- **Core Functionality:**
  - View user's Problemsets (Contests/Homework) categorized into "Ongoing," "Upcoming," and "Passed" sections in a dedicated Tree View.
  - Expand Problemsets to view contained Problems.
- **User Interface:**
  - Tree View for categorized Problemsets.
  - Tree View for user Submissions with status icons.
  - Status Bar item displaying login status and username/friendly name.
  - Command `ACMOJ: Show My Profile` to display basic user info.
- **Rendering:**
  - Markdown rendering for Problem descriptions, input/output formats, and data ranges in the Webview using `markdown-it`.
  - LaTeX equation rendering (inline `$...$` and display `$$...$$`) within Markdown content using KaTeX, bundled with the extension.
  - Webview styling using VS Code theme variables for better integration.

### Changed

- **Problem View:** Replaced the initial idea of a flat problem list view with the categorized Problemset view as the primary way to browse assignments/contests.
- **Webview Content:** Enhanced Webview HTML generation to include proper CSP, nonces, KaTeX assets, and improved CSS styling.

### Fixed

- Resolved various TypeScript compilation errors related to module resolution, type definitions (`@types/vscode`), implicit `any` types, `QuickPickItem` usage, and property overrides.
- Improved error handling for API requests, particularly for 401 (Unauthorized) and 403 (Forbidden) status codes.

### Removed

- The initial simple "Problems" list view provider (superseded by `ProblemsetProvider`).

## [0.2.0] - 2025-3-29

### Fixed

- Fixed the issue where the `katex` library was not being loaded correctly in the Webview, causing LaTeX rendering to fail.
- Resolved the problem with the `markdown-it` library not being loaded correctly in the Webview, which affected Markdown rendering.

## [0.2.1] - 2025-3-29

### Fixed

- Dependency issue with `katex` and `markdown-it` libraries causing Webview rendering problems.

## [0.2.2] - 2025-3-29

### Added

- Added a user-friendly interface for submission details, including a collapsible section for the judge's message.

## [0.2.3] - 2025-3-30

### Fixed

- Missing watch:tsc and watch:esbuild scripts in package.json.

### Added

- Added inference of problem id from the active editor's filename and comments.

## [0.2.4] - 2025-3-30

### Added

- Added description of problemset in problemsetProvider.

## [0.2.5] - 2025-3-30

### Fixed

- Each problem in the tree will have a unique ID even if the same problem appears in multiple problemsets.

## [0.2.6] - 2025-3-30

### Added

- Infer type of submission from vscode language id.
- List of contributors in package.json.

### Changed

- Better logic for Git submissions, with inference of git remotes.

## [0.2.7] - 2025-3-30

### Added

- Pagination to the submission list.

### Fixed

- Icons for submission status.
- `npm run format` command to format all files in the project.

## [0.2.8] - 2025-3-30

### Added

- Added a command to copy the example input to the active terminal or clipboard.

## [0.2.9] - 2025-3-30

### Fixed

- Increased timeout for submission status check to 15 seconds.

### Added

- Added back-to-first-page button to the submission list.

## [0.2.10] - 2025-3-31

### Added

- Icon for the the button in the menu bar.
- Logo for the extension.

## [0.2.11] - 2025-3-31

### Fixed

- Fixed the issue where clicking the refresh button in the submission view would automatically jump to the next page.

## [0.3.0] - 2025-3-31

### Added

- Added cache for api requests, with a default expiration time of 15 minutes, which significantly improves user experience.

## [0.3.1] - 2025-4-1

### Fixed

- Fixed the issue where the `previous-page` button do not exist at page 2.

## [0.3.2] - 2025-4-1

### Fixed

- Fixed the cache issue where the cache was not being cleared when the token was changed.
- Fixed the issue where the submission status was not being updated correctly after a submission (being cached).

## [0.3.3] - 2025-4-1

### Fixed

- Added submissions monitor to monitor submission more precisely
- Fixed the cache issue where the cache was not being cleared when the token was changed.

## [0.4.0] - 2025-4-2

### Added

- Added a command to open the problem in the editor when clicking it in the submission view.
- Added filter in the submission view.

### Removed

- The `problemProvider.ts` is deprecated and removed.

### Changed

- Make the indentation of the problemset view smaller.
- Changed the cache expiration of user profile and submission to 1 hour.

## [0.4.1] - 2025-4-3

### Fixed

- Fixed the issue where the filter in the submission view causes the submission item to be indented

## [0.5.0] - 2025-4-13

### Refactor

- Completely refactored the code to use a more modular approach, separating concerns and improving readability.

- Moved all API-related code to a separate module for better organization.

- Improved error handling and logging throughout the extension.

## [0.5.1] - 2025-4-21

### Fixed

- Fix the render of "No examples provided."
- Fix `husky` pre-commit hook to run `prettier` and `eslint` on all files.

## [0.5.2] - 2025-4-22

### Fixed

- Fix the issue where the `example description` is not being rendered correctly in the problem view.

## [0.5.3] - 2025-4-23

### Fixed

- Fix the refresh button in problemset view and the submission view to clear the cache and reload the data.
