export interface ProblemBrief {
  id: number
  title: string | null
  url: string | null
  html_url: string | null
  submit_url: string | null
}

export interface Problem {
  id: number
  title: string
  description: string | null
  input: string | null
  output: string | null
  examples: Array<{
    name?: string
    input?: string
    output?: string
    description?: string
  }> | null
  example_input: string | null // old version example
  example_output: string | null // old version example
  data_range: string | null
  languages_accepted: string[] | null
  // TODO: ... more fields, I do not care about it now
}

export type SubmissionStatus =
  | 'accepted'
  | 'wrong_answer'
  | 'compile_error'
  | 'runtime_error'
  | 'time_limit_exceeded'
  | 'memory_limit_exceeded'
  | 'disk_limit_exceeded'
  | 'memory_leak'
  | 'pending'
  | 'compiling'
  | 'judging'
  | 'void'
  | 'aborted'
  | 'skipped'
  | 'system_error'
  | 'bad_problem'
  | 'unknown_error'

export interface SubmissionBrief {
  id: number
  friendly_name: string
  problem: ProblemBrief
  status: SubmissionStatus
  language: string
  created_at: string // ISO date string
  url: string | null
  html_url: string | null
}

export interface Submission {
  id: number
  friendly_name: string
  problem: ProblemBrief
  public: boolean
  language: string
  score: number | null
  message: string | null
  details: any | null
  time_msecs: number | null
  memory_bytes: number | null
  status: SubmissionStatus
  should_show_score: boolean
  created_at: string
  code_url: string | null
  abort_url: string | null
  html_url: string | null
}

export interface TokenResponse {
  access_token: string
  token_type: 'bearer'
  expires_in: number
  scope: string
}

export interface Profile {
  username: string
  friendly_name: string
  student_id: string
}

export interface CourseBrief {
  id: number
  name: string
}

export type ProblemsetType = 'contest' | 'homework' | 'exam'

export interface Problemset {
  id: number
  course: CourseBrief | null
  name: string
  description: string | null
  allowed_languages: string[] | null
  start_time: string // ISO date string
  end_time: string // ISO date string
  late_submission_deadline: string | null // ISO date string
  type: ProblemsetType
  problems: ProblemBrief[] // Array of brief problem info
  url: string
  join_url: string | null
  quit_url: string | null
  html_url: string
}

export interface ApiError {
  message: string
  // might include more fields like code, details, etc.
}
