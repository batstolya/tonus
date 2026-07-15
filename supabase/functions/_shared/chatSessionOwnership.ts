export interface OwnedChatSession {
  id: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isValidChatSessionId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

interface SessionLookupResult {
  data: OwnedChatSession | null
  error: unknown
}

interface SessionLookupQuery {
  select(columns: 'id'): SessionLookupQuery
  eq(column: 'id' | 'user_id', value: string): SessionLookupQuery
  maybeSingle(): Promise<SessionLookupResult>
}

export interface SessionLookupClient {
  from(table: 'chat_sessions'): SessionLookupQuery
}

interface SessionCreateResult {
  data: OwnedChatSession | null
  error: unknown
}

interface SessionCreateQuery {
  insert(values: { user_id: string }): SessionCreateQuery
  select(columns: 'id'): SessionCreateQuery
  single(): Promise<SessionCreateResult>
}

export interface SessionOwnershipClient extends SessionLookupClient {
  from(table: 'chat_sessions'): SessionLookupQuery & SessionCreateQuery
}

export interface ChatHistoryMessage {
  role: string
  content: string
}

interface ChatHistoryResult {
  data: ChatHistoryMessage[] | null
  error: unknown
}

interface ChatHistoryQuery {
  select(columns: 'role, content'): ChatHistoryQuery
  eq(column: 'session_id' | 'user_id', value: string): ChatHistoryQuery
  order(column: 'created_at', options: { ascending: false }): ChatHistoryQuery
  limit(count: number): Promise<ChatHistoryResult>
}

export interface ChatHistoryClient {
  from(table: 'chat_messages'): ChatHistoryQuery
}

export function findOwnedChatSession(
  client: SessionLookupClient,
  sessionId: string,
  userId: string,
): Promise<SessionLookupResult> {
  return client
    .from('chat_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle()
}

export async function resolveOrCreateOwnedChatSession(
  client: SessionOwnershipClient,
  suppliedSessionId: unknown,
  userId: string,
): Promise<OwnedChatSession> {
  if (isValidChatSessionId(suppliedSessionId)) {
    const lookup = await findOwnedChatSession(client, suppliedSessionId, userId)
    if (lookup.error) throw new Error('Session lookup failed')
    if (lookup.data) return lookup.data
  }

  const created = await client
    .from('chat_sessions')
    .insert({ user_id: userId })
    .select('id')
    .single()
  if (created.error || !created.data) throw new Error('Session insert failed')
  return created.data
}

export function loadOwnedChatHistory(
  client: ChatHistoryClient,
  sessionId: string,
  userId: string,
  limit: number,
): Promise<ChatHistoryResult> {
  return client
    .from('chat_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
}
