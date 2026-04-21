import { supabase } from '@/lib/supabase'
import { destroyBill } from '@/lib/payssam'

// 예약된 파기(send_type='destroy') 중 scheduled_at이 지난 것들을 처리.
// /api/billing/queue GET 같은 자주 호출되는 엔드포인트에서 lazy하게 불러
// Vercel Hobby 플랜의 일 1회 cron 제약을 실질적으로 보완한다.
// (앱을 자주 열면 곧 처리되고, 안 열면 다음 cron까지 대기)
export async function processOverdueDestroys(): Promise<void> {
  const nowIso = new Date().toISOString()
  const { data: overdue } = await supabase
    .from('tuition_bill_queue')
    .select('id, payload')
    .eq('send_type', 'destroy')
    .eq('status', 'pending')
    .lte('scheduled_at', nowIso)
    .limit(20)

  if (!overdue || overdue.length === 0) return

  for (const row of overdue) {
    const { billId, amount, methodLabel } = row.payload as { billId: string; amount: number; methodLabel?: string }
    try {
      const { data: bill } = await supabase
        .from('tuition_bill_history')
        .select('status')
        .eq('bill_id', billId)
        .single()

      if (!bill || bill.status !== 'sent') {
        await supabase
          .from('tuition_bill_queue')
          .update({ status: 'cancelled', error_msg: '대상 청구서 상태 변동', sent_at: new Date().toISOString() })
          .eq('id', row.id)
        continue
      }

      const result = await destroyBill(billId, amount)
      if (result.code === '0000') {
        await supabase
          .from('tuition_bill_history')
          .update({
            status: 'destroyed',
            bill_note: `${methodLabel ?? '타 결제수단'} 결제로 자동 파기`,
            updated_at: new Date().toISOString(),
          })
          .eq('bill_id', billId)
        await supabase
          .from('tuition_bill_queue')
          .update({ status: 'sent', bill_id: billId, sent_at: new Date().toISOString() })
          .eq('id', row.id)
      } else {
        await supabase
          .from('tuition_bill_queue')
          .update({ status: 'failed', error_msg: result.msg || '파기 실패', sent_at: new Date().toISOString() })
          .eq('id', row.id)
      }
    } catch (e) {
      console.error('[deferredDestroy] 처리 실패:', row.id, e)
    }
  }
}
