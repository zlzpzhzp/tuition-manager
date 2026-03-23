import { supabase } from './supabase'

type EntityType = 'payment' | 'student' | 'class' | 'grade' | 'teacher'
type Action = 'create' | 'update' | 'delete'

export async function writeAuditLog(
  entityType: EntityType,
  entityId: string | null,
  action: Action,
  summary: string,
  details?: Record<string, unknown>
) {
  try {
    await supabase.from('audit_logs').insert({
      entity_type: entityType,
      entity_id: entityId,
      action,
      summary,
      details: details ?? null,
    })
  } catch {
    // 로그 실패가 메인 로직을 방해하면 안 됨
    console.error('Audit log write failed')
  }
}
