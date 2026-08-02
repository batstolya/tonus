import { supabase } from './supabase'
import { callFunction } from './edgeFunctions'
import { isDemoActive } from './demo'
import { demoList, demoRemove } from './demoDb'

export interface LabFile {
  id: string
  user_id: string
  file_name: string
  file_path: string | null
  file_type: string | null
  date: string | null
  extracted_text: string | null
  created_at: string
}

export interface LabResult {
  id: string
  lab_file_id: string
  marker: string
  value: number
  unit: string | null
  ref_range?: string | null
  flag?: string | null
  /** Import date. Chronology reads sample_date; this stays for legacy rows. */
  date: string
  /** When the sample was taken, as far as it is known. */
  sample_date?: string | null
  sample_date_precision?: 'day' | 'month' | 'unknown' | null
  /** Canonical analyte slug; null when the marker name was not recognised. */
  analyte_key?: string | null
}

export async function loadLabFiles(userId: string): Promise<LabFile[]> {
  if (isDemoActive()) {
    return (demoList('lab_files') as LabFile[])
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  }
  const { data, error } = await supabase
    .from('lab_files')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
  if (error) throw error
  return (data ?? []) as LabFile[]
}

export async function loadLabResults(userId: string): Promise<LabResult[]> {
  if (isDemoActive()) {
    return (demoList('lab_results') as LabResult[]).sort((a, b) => a.date.localeCompare(b.date))
  }
  const { data, error } = await supabase
    .from('lab_results')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: true })
  if (error) throw error
  return (data ?? []) as LabResult[]
}

export async function deleteLabFile(id: string): Promise<void> {
  if (isDemoActive()) {
    for (const r of demoList('lab_results').filter(r => r.lab_file_id === id)) demoRemove('lab_results', r.id)
    return demoRemove('lab_files', id)
  }
  await supabase.from('lab_files').delete().eq('id', id)
}

export async function uploadAndExtract(
  _userId: string,
  file: File,
  date: string,
): Promise<LabFile | null> {
  // Convert file to base64
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  bytes.forEach(b => { binary += String.fromCharCode(b) })
  const base64 = btoa(binary)

  return callFunction<LabFile>('extract-lab', {
    fileName: file.name,
    fileType: file.type,
    fileBase64: base64,
    date,
  })
}
