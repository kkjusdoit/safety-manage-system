import type { EducationBatch, Employee, EntryExitLog, RewardRecord } from './types'

const fetchJson = async <T,>(path: string): Promise<T> => {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`)
  }
  return response.json() as Promise<T>
}

export const dataService = {
  getEmployees: async () => {
    const data = await fetchJson<{ employees: Employee[] }>('/data/employees.json')
    return data.employees
  },
  getEducationBatches: async () => {
    const data = await fetchJson<{ batches: EducationBatch[] }>('/data/education.json')
    return data.batches
  },
  getEntryExitLogs: async () => {
    const data = await fetchJson<{ logs: EntryExitLog[] }>('/data/entry_exit.json')
    return data.logs
  },
  getRewards: async () => {
    const data = await fetchJson<{ records: RewardRecord[] }>('/data/rewards.json')
    return data.records
  }
}
