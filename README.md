# ACMOJ Helper for VS Code

[![Version](https://img.shields.io/visual-studio-marketplace/v/theunknownthing.vscode-acmoj.svg?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=theunknownthing.vscode-acmoj)

[![Installs](https://img.shields.io/visual-studio-marketplace/i/theunknownthing.vscode-acmoj.svg?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=theunknownthing.vscode-acmoj)

[![License](https://img.shields.io/github/license/theunknownthing/vscode-acmoj.svg?style=flat-square)](LICENSE.md)

**Interact with ACM Class Online Judge (ACMOJ) directly within Visual Studio Code.**

This extension allows you to browse problemsets (contests/homework), view problems, submit your code, and check submission results without leaving your editor.

## Features

- **Authentication:** Securely connect to ACMOJ using your Personal Access Token (PAT).
- **Status Bar Integration:** See your login status and username at a glance. Click to view profile details or set your token.
- **Problemset Browsing:** View your joined contests and homework assignments in a dedicated Tree View in the Activity Bar.
- **Problem Viewing:**
  - Expand problemsets to see included problems.
  - Click on a problem in the Tree View to open its description, examples, and details in a separate tab (Webview).
  - Use the `ACMOJ: View Problem by ID...` command to quickly open any problem.
  - **Attachment Support:** Download problem attachments directly from the problem view with proper authentication.
- **Code Submission:** Submit code directly from your active editor using the `ACMOJ: Submit Current File` command (available in Command Palette and editor title bar).
- **Submission Tracking:** View your recent submissions in a dedicated Tree View, including status, language, and time. Status icons provide quick feedback.
- **Result Details:** Click on a submission to view detailed results, resource usage, judge messages, and your submitted code in a Webview.
- **Pre-Submit Hooks:** Fully automate the submission process by setting up pre-submit hooks to run tests or format code before submission.

## Screenshots

Full procedure of viewing problem, submitting code, and checking submission results.
![Full Procedure](static/full-procedure.gif)

Problemset Tree View with joined contests and homework assignments.
![Problemset Tree View](static/problemset-tree-view.gif)

## Requirements

- Visual Studio Code v1.98.0 or higher.
- An active account on the target ACMOJ instance ([acm.sjtu.edu.cn/OnlineJudge/](https://acm.sjtu.edu.cn/OnlineJudge/)).

## Installation

1.  Open **Visual Studio Code**.
2.  Go to the **Extensions** view (`Ctrl+Shift+X` or `Cmd+Shift+X`).
3.  Search for `ACMOJ Helper`.
4.  Click **Install** on the extension published by `TheUnknownThing`.
5.  Reload VS Code if prompted.

## Getting Started

1.  **Generate a Personal Access Token (PAT):**
    - Log in to the ACMOJ website.
    - Navigate to your user settings (usually top-right corner menu) and find the "API" section.
    - Generate a new Personal Access Token. **Crucially, ensure you grant it the necessary scopes** (e.g., `user:profile`, `problem:read`, `submission:read`, `submission:create`, `problemset:read`). For downloading problem attachments, ensure your token has sufficient permissions to access problem resources. Copy the generated token (it often looks like `acmoj-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`).
2.  **Set the Token in VS Code:**
    - Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`).
    - Run the command `ACMOJ: Set Personal Access Token`.
    - Paste your copied PAT into the input box and press Enter.
    - The extension will attempt to validate the token. The status bar item should update to show your username upon success.
3.  **Explore the ACMOJ Activity Bar:**
    - Click the ACMOJ icon (usually a checklist `$(checklist)`) in the Activity Bar on the left.
    - You will see two views: "Problemsets" and "My Submissions".
    - Use the refresh icon `$(refresh)` in the view title bars to update the lists.
4.  **Viewing Problems:**
    - Expand items in the "Problemsets" view to find problems.
    - Click a problem name to open its details.
    - Alternatively, use the `ACMOJ: View Problem by ID...` command. (You would open it from the Command Palette and enter the problem ID.)
5.  **Submitting Code:**
    - Open the code file you want to submit.
    - Click the ACMOJ submit icon `$(cloud-upload)` in the editor title bar, or run `ACMOJ: Submit Current File` from the Command Palette.
    - Enter the Problem ID when prompted.
    - Select the correct programming language for your submission.
6.  **Checking Submissions:**
    - The "My Submissions" view shows your recent submissions.
    - Click a submission to see its detailed results and code.
7.  **Downloading Problem Attachments:**
    - When viewing a problem that has attachments, you'll see an "Attachments" section at the bottom.
    - Click the download button (⬇) next to any attachment to download it with proper authentication.
    - Attachments can be downloaded to your workspace folder (`.acmoj/problem-{id}/`) or to a custom location via file dialog.
    - The download progress is shown with a cancellable notification.

## Advanced Usage

This section is for advanced users who want to unleash the full power of the ACMOJ extension.

### Pre-Submit Hooks

A pre-submit hook is a series of steps taken to modify or validate your code before submission. To create a pre-submit hook, create this file: `(project_root)/.acmoj/pre-submit.json`.

The file should be a json list, each entry (called 'step') is one of the following types:

- `command`: A shell command to execute. Please fill in the `content` field with the command to run.
- `script`: A script to execute. Please fill in the `path` field with the script to run.
- `action`: A registered vscode action to execute. Please fill in the `name` field with the command-id to run.

For the first two types, by default no input is provided. Instead, variables will be used to specify the active code file to submit. Here is a list of available variables:

- `${ACMOJ_FILE_PATH}`: The absolute path of the active code file.
- `${ACMOJ_FILE_NAME}`: The name of the active code file.
- `${ACMOJ_FILE_NAME_NO_SUFFIX}`: The name of the active code file without its extension suffix.
- `${ACMOJ_FILE_DIR}`: The directory of the active code file.
- `${ACMOJ_FILE_CONTENT}`: The content of the active code file.
  The variables are updated before each step is executed, but will not be updated during the execution of the step.

You can also specify a `output` field for the first two types. Recognized values are:

- `ignore`: (default) Ignore the output of the step.
- `show`: Print stdout and stderr with notifications inside vscode.
- `submit`: Use the output of the step for submission. If multiple steps are marked as `submit`, their outputs will be concatenated.
- `pipe`: The output of the step will be passed to the next step as input.

The base route for the `path` field of scripts is the project root. You are encouraged to use a `description` field to provide a human-readable description of each step.

Example hook:

```json
[
  {
    "type": "action",
    "name": "editor.action.formatDocument",
    "description": "Format the current document"
  },
  {
    "type": "command",
    "content": "mango build ${ACMOJ_FILE_PATH}",
    "description": "Build into single file and place under dist/ (user-defined command)"
  },
  {
    "type": "script",
    "path": ".acmoj/safeguard.sh",
    "description": "Compilation safeguard",
    "output": "show"
  },
  {
    "type": "command",
    "content": "cat ${ACMOJ_FILE_DIR}/dist/${ACMOJ_FILE_NAME}",
    "output": "submit"
  }
]
```

With safeguard.sh placed in the `.acmoj` directory:

```bash
#! /bin/bash

set -e  # Exit immediately if a command exits with a non-zero status
g++ ${ACMOJ_FILE_DIR}/dist/${ACMOJ_FILE_NAME} -std=c++23 -o ${ACMOJ_FILE_DIR}/dist/${ACMOJ_FILE_NAME}.build
rm ${ACMOJ_FILE_DIR}/dist/${ACMOJ_FILE_NAME}.build
echo "Safeguard passed."
```

## Extension Settings

This extension contributes the following settings (accessible via `File > Preferences > Settings` and searching for "ACMOJ"):

- `acmoj.baseUrl`: The base URL of the ACMOJ instance (e.g., `https://acm.sjtu.edu.cn`). Defaults are usually provided.
- `acmoj.apiRetryCount`: Number of times to retry failed API requests. Default: `3`
- `acmoj.apiRetryDelay`: Delay in milliseconds between API retry attempts. Default: `1000`
- `acmoj.apiRequestTimeout`: Timeout in milliseconds for API requests. Default: `15000`
- `acmoj.submissionMonitorInterval`: Interval in milliseconds for checking submission status updates. Default: `4000`
- `acmoj.submissionMonitorTimeout`: Maximum time in milliseconds to monitor a submission before timing out. Default: `120000`
- `acmoj.attachments.downloadLocationMode`: How to handle attachment downloads. Options: `workspace` (download to workspace `.acmoj/problem-{id}/` folder) or `ask` (prompt for location each time). Default: `workspace`

## Known Issues

- Error handling can be improved for edge cases.
- API rate limits may affect viewing problemsets or submissions. **(Major Issue)** Now, we use a cache to store the problemset and submission data for 15 minutes. This should help reduce the number of API calls and avoid rate limits.

## Contributing

Contributions are welcome! Please feel free to open an issue or submit a pull request on the [GitHub Repo](https://github.com/theunknownthing/vscode-acmoj).

For more details on contributing, please refer to the [CONTRIBUTING.md](CONTRIBUTING.md) file.

## License

[MIT License](LICENSE)
