import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

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
- payment_method: "remote"(결제선생) | "card"(카드) | "transfer"(이체) | "cash"(현금) | "other"(기타) | null
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

    const now = new Date()
    const currentDate = now.toISOString().split('T')[0]

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

    // JSON 추출
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return NextResponse.json({
        student_ids: parsed.student_ids || [],
        description: parsed.description || '필터 적용',
      })
    }

    return NextResponse.json({ student_ids: [], description: '필터 결과 없음' })
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('Filter error:', errMsg)
    return NextResponse.json({ error: errMsg }, { status: 500 })
  }
}
