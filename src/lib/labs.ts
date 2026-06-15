import { supabase } from './supabase'

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
  date: string
}

export async function loadLabFiles(userId: string): Promise<LabFile[]> {
  const { data } = await supabase
    .from('lab_files')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
  return (data ?? []) as LabFile[]
}

export async function loadLabResults(userId: string): Promise<LabResult[]> {
  const { data } = await supabase
    .from('lab_results')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: true })
  return (data ?? []) as LabResult[]
}

export async function deleteLabFile(id: string): Promise<void> {
  await supabase.from('lab_files').delete().eq('id', id)
}

export async function uploadAndExtract(
  userId: string,
  file: File,
  date: string,
): Promise<LabFile | null> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Не авторизован')

  // Convert file to base64
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  bytes.forEach(b => { binary += String.fromCharCode(b) })
  const base64 = btoa(binary)

  const supabaseUrl = (supabase as any).supabaseUrl as string
  const res = await fetch(`${supabaseUrl}/functions/v1/extract-lab`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      fileName: file.name,
      fileType: file.type,
      fileBase64: base64,
      date,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Ошибка извлечения данных')
  }

  return res.json()
}
