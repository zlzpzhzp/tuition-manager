import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireAdminSession } from '@/lib/auth'
import { writeAuditLog } from '@/lib/auditLog'

const MAX_FILE_SIZE = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const BUCKET = 'tuition-receipts'

// 영수증 사진 업로드 → tuition-receipts 버킷에 저장 → receipt_images 배열 append
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireAdminSession(request)
  if (unauthorized) return unauthorized
  const { id } = await params

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 })
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: '5MB 이하만 가능' }, { status: 400 })
  if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: 'JPG/PNG/WebP만 가능' }, { status: 400 })

  const ext = (file.name.split('.').pop()?.toLowerCase() || 'jpg').replace(/[^a-z0-9]/g, '')
  const fileName = `${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(fileName, file, { contentType: file.type, upsert: false, cacheControl: '3600' })
  if (uploadErr) {
    console.error('[receipt-upload] storage 실패:', { id, fileName, size: file.size, type: file.type, err: uploadErr })
    return NextResponse.json({ error: `업로드 실패: ${uploadErr.message}` }, { status: 500 })
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(fileName)
  const url = urlData.publicUrl

  const { data: existing, error: selectErr } = await supabase
    .from('tuition_payments')
    .select('receipt_images')
    .eq('id', id)
    .single()
  if (selectErr) {
    console.error('[receipt-upload] select 실패:', { id, err: selectErr })
    return NextResponse.json({ error: `DB 조회 실패: ${selectErr.message}` }, { status: 500 })
  }
  const next = [...((existing?.receipt_images as string[] | null) ?? []), url]

  const { error: updateErr } = await supabase
    .from('tuition_payments')
    .update({ receipt_images: next })
    .eq('id', id)
  if (updateErr) {
    console.error('[receipt-upload] update 실패:', { id, err: updateErr })
    return NextResponse.json({ error: `DB 업데이트 실패: ${updateErr.message}` }, { status: 500 })
  }

  writeAuditLog('payment', id, 'update', `영수증 사진 추가 (${next.length}장)`, { added: url })
  return NextResponse.json({ url, receipt_images: next })
}

// 영수증 사진 삭제 — body.url 기준으로 receipt_images에서 제거 + Storage 객체도 제거
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const unauthorized = requireAdminSession(request)
  if (unauthorized) return unauthorized
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const url = body?.url as string | undefined
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 })

  const { data: existing } = await supabase
    .from('tuition_payments')
    .select('receipt_images')
    .eq('id', id)
    .single()
  const current = (existing?.receipt_images as string[] | null) ?? []
  const next = current.filter(u => u !== url)

  const { error: updateErr } = await supabase
    .from('tuition_payments')
    .update({ receipt_images: next })
    .eq('id', id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  const marker = `/storage/v1/object/public/${BUCKET}/`
  const markerIdx = url.indexOf(marker)
  if (markerIdx >= 0) {
    const objectPath = url.slice(markerIdx + marker.length)
    await supabase.storage.from(BUCKET).remove([objectPath]).catch(() => null)
  }

  writeAuditLog('payment', id, 'update', `영수증 사진 삭제 (남은 ${next.length}장)`, { removed: url })
  return NextResponse.json({ receipt_images: next })
}
