export type EmployeeStatus = '在场' | '退场' | '历史'

export interface EmployeeTimelineItem {
  date: string
  event: string
}

export interface EmployeeCert {
  name: string
  expiry: string
}

export interface Employee {
  id: string
  name: string
  role: string
  team: string
  entryDate: string
  status: EmployeeStatus
  educationProgress: number
  score: number
  phone: string
  idNumber: string
  emergencyContact: string
  cert: EmployeeCert
  documents: string[]
  timeline: EmployeeTimelineItem[]
}

export interface EducationRecord {
  time: string
  hours?: number
  score?: number
  leader?: string
  photo?: boolean
  signed?: boolean
}

export interface EducationBatch {
  id: string
  title: string
  level: string
  startDate: string
  trainer: string
  participants: string[]
  status: string
  completion: number
  records: {
    company: EducationRecord
    project: EducationRecord
    team: EducationRecord
  }
}

export interface EntryExitLog {
  id: string
  name: string
  type: '进场' | '退场' | '调动'
  date: string
  reason: string
  teamFrom: string
  teamTo: string
}

export interface RewardRecord {
  id: string
  name: string
  type: '奖励' | '处罚'
  reason: string
  date: string
  score: number
  amount: number
  evidence: string
}
