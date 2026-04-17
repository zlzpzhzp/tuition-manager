import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getTodayString } from '@/lib/date'

const SYSTEM_PROMPT = `당신은 학원 원비관리 시스템의 필터 엔진입니다.
학생 데이터 목록과 사용자의 한국어 필터 요청을 받아서, 조건에 맞는 학생만 골라냅니다.

반드시 아래 JSON 형식만 반환하세요 (다른 텍스트 없이):
{
  "student_ids": ["id1", "id2"],
  "description": "짧은 필터 설명"
}

학생 데이터 필드 설명:
- id: 고유 ID
- name: 이름
- grade: 학년 (예: "중1", "중2")
- class_name: 반 이름 (예: "수학H", "영어A")
- fee: 월 원비 (원 단위)
- paid: 이번달 납부 금액
- status: "paid"(납부완료) | "partial"(부분납부) | "unpaid"(미납)
- due_day: 결제일 (매월 몇일)
- payment_method: "payssam"(결제선생) | "card"(카드) | "transfer"(이체) | "cash"(현금) | "other"(기타) | null
- payment_date: 실제 납부일 또는 null
- current_memo: 이번달 특이사항
- prev_memo: 지난달 특이사항
- has_discuss: DISCUSS 표시 여부

규칙:
- 조건에 맞는 모든 학생 ID를 포함
- "결제일"은 due_day 필드
- "미납" = status가 "unpaid"
- "납부완료" = status가 "paid"
- "특이사항" = current_memo 또는 prev_memo가 존재
- "DISCUSS" = has_discuss가 true
- description은 한국어로 15자 이내
- 오늘 날짜: {current_date}
- 조회 중인 월: {billing_month}`

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' }, { status: 500 })
    }

    const { query, context } = await req.json()

    // Input validation
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json({ error: '필터 요청을 입력해주세요.' }, { status: 400 })
    }
    if (query.length > 200) {
      return NextResponse.json({ error: '필터 요청은 200자 이내여야 합니다.' }, { status: 400 })
    }

    const currentDate = getTodayString()

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: SYSTEM_PROMPT
        .replace(/{current_date}/g, currentDate)
        .replace(/{billing_month}/g, context.billing_month || currentDate.slice(0, 7)),
    })

    const prompt = `학생 데이터:\n${JSON.stringify(context.students, null, 2)}\n\n필터 요청: ${query}`

    const result = await model.generateContent(prompt)
    const text = result.response.text()

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(jsonMatch[0])
      } catch {
        console.error('Filter JSON parse error:', jsonMatch[0])
        return NextResponse.json({ student_ids: [], description: 'AI 응답 파싱 실패' })
      }

      // Validate returned IDs exist in input context
      const validIds = new Set((context.students || []).map((s: { id: string }) => s.id))
      const filteredIds = ((parsed.student_ids as string[]) || []).filter((id: string) => validIds.has(id))

      return NextResponse.json({
        student_ids: filteredIds,
        description: typeof parsed.description === 'string' ? parsed.description.slice(0, 30) : '필터 적용',
      })
    }

    return NextResponse.json({ student_ids: [], description: '필터 결과 없음' })
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('Filter error:', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
