import { supabase } from './supabase'
import { callFunction } from './edgeFunctions'

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
  date: string
}

export async function loadLabFiles(userId: string): Promise<LabFile[]> {
  const { data, error } = await supabase
    .from('lab_files')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
  if (error) throw error
  return (data ?? []) as LabFile[]
}

export async function loadLabResults(userId: string): Promise<LabResult[]> {
  const { data, error } = await supabase
    .from('lab_results')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: true })
  if (error) throw error
  return (data ?? []) as LabResult[]
}

export async function deleteLabFile(id: string): Promise<void> {
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
