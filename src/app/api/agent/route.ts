import { NextResponse } from 'next/server'
import { GoogleGenerativeAI, SchemaType, Content, Part, type Tool } from '@google/generative-ai'
import { queryGradesTree, mapGradesTree, queryPaidMap } from '@/lib/queries'

// ── Tool definitions ──

interface ToolDef {
  name: string
  description: string
  parameters: {
    type: string
    properties: Record<string, { type: string; description: string; enum?: string[] }>
    required?: string[]
  }
}

const toolDefinitions: ToolDef[] = [
  {
    name: 'list_grades_and_classes',
    description: '학년/반/학생 전체 목록을 조회합니다. 학생 이름, 소속 반, 원비 등을 확인할 수 있습니다.',
    parameters: { type: 'OBJECT', properties: {}, required: [] },
  },
  {
    name: 'get_unpaid_students',
    description: '특정 월의 미납 학생 목록을 조회합니다.',
    parameters: {
      type: 'OBJECT',
      properties: {
        billing_month: { type: 'STRING', description: '조회할 월 (YYYY-MM)' },
      },
      required: ['billing_month'],
    },
  },
  {
    name: 'get_payment_status',
    description: '특정 월의 납부 현황을 반별로 조회합니다.',
    parameters: {
      type: 'OBJECT',
      properties: {
        billing_month: { type: 'STRING', description: '조회할 월 (YYYY-MM)' },
      },
      required: ['billing_month'],
    },
  },
]

// ── Convert to Gemini SDK format ──

function getGeminiTools(): Tool[] {
  return [{
    functionDeclarations: toolDefinitions.map(t => ({
      name: t.name,
      description: t.description,
      parameters: {
        type: SchemaType.OBJECT as const,
        properties: Object.fromEntries(
          Object.entries(t.parameters.properties).map(([key, val]) => [
            key,
            { type: SchemaType.STRING as const, description: val.description },
          ])
        ),
        required: t.parameters.required || [],
      },
    })),
  }]
}

// ── Tool execution (공유 쿼리 사용) ──

async function listGradesAndClasses() {
  try {
    const { data, error } = await queryGradesTree()
    if (error) return { error: error.message }

    const mapped = mapGradesTree(data ?? [])
    return mapped.map(g => ({
      grade: g.name,
      classes: g.classes.map(c => ({
        name: c.name,
        subject: c.subject,
        monthly_fee: c.monthly_fee,
        students: (c.students ?? [])
          .filter((s: Record<string, unknown>) => !s.withdrawal_date)
          .map((s: Record<string, unknown>) => ({
            name: s.name,
            custom_fee: s.custom_fee,
            id: s.id,
          })),
      })),
    }))
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('listGradesAndClasses error:', msg)
    return { error: `학년/반 조회 실패: ${msg}` }
  }
}

async function getUnpaidStudents(args: Record<string, string>) {
  try {
    const { data, error } = await queryGradesTree()
    if (error || !data) return { error: error?.message ?? '데이터 조회 실패' }

    const mapped = mapGradesTree(data)
    const { paidMap } = await queryPaidMap(args.billing_month)

    const unpaid: { grade: string; class_name: string; name: string; fee: number; paid: number }[] = []
    for (const g of mapped) {
      for (const c of g.classes) {
        for (const s of (c.students ?? [])) {
          const student = s as Record<string, unknown>
          if (student.withdrawal_date) continue
          const fee = (student.custom_fee as number | null) ?? c.monthly_fee
          const paid = paidMap[student.id as string] ?? 0
          if (paid < fee) unpaid.push({ grade: g.name, class_name: c.name, name: student.name as string, fee, paid })
        }
      }
    }

    return { billing_month: args.billing_month, total_unpaid: unpaid.length, students: unpaid }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('getUnpaidStudents error:', msg)
    return { error: `미납 학생 조회 실패: ${msg}` }
  }
}

async function getPaymentStatusByMonth(args: Record<string, string>) {
  try {
    const { data, error } = await queryGradesTree()
    if (error || !data) return { error: error?.message ?? '데이터 조회 실패' }

    const mapped = mapGradesTree(data)
    const { paidMap } = await queryPaidMap(args.billing_month)

    const result = []
    for (const g of mapped) {
      for (const c of g.classes) {
        const activeStudents = (c.students ?? []).filter((s: Record<string, unknown>) => !s.withdrawal_date)
        let paidCount = 0, totalFee = 0, totalPaid = 0

        for (const s of activeStudents) {
          const student = s as Record<string, unknown>
          const fee = (student.custom_fee as number | null) ?? c.monthly_fee
          const paid = paidMap[student.id as string] ?? 0
          totalFee += fee
          totalPaid += paid
          if (paid >= fee) paidCount++
        }

        if (activeStudents.length > 0) {
          result.push({
            grade: g.name, class_name: c.name,
            total_students: activeStudents.length, paid_count: paidCount,
            unpaid_count: activeStudents.length - paidCount,
            total_fee: totalFee, total_paid: totalPaid,
          })
        }
      }
    }

    return { billing_month: args.billing_month, classes: result }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('getPaymentStatusByMonth error:', msg)
    return { error: `납부 현황 조회 실패: ${msg}` }
  }
}

async function executeTool(name: string, args: Record<string, string>): Promise<unknown> {
  switch (name) {
    case 'list_grades_and_classes': return listGradesAndClasses()
    case 'get_unpaid_students': return getUnpaidStudents(args)
    case 'get_payment_status': return getPaymentStatusByMonth(args)
    default: return { error: `알 수 없는 도구: ${name}` }
  }
}

// ── System prompt ──

const SYSTEM_PROMPT = `당신은 학원 원비관리 시스템의 AI 어시스턴트입니다.
사용자의 질문에 데이터를 조회해서 정확하게 답변하는 것이 당신의 역할입니다.

**⚠️ 최우선 규칙: 조회 전용 - 데이터 변경 절대 금지**
당신은 데이터를 조회하고 질문에 답변하는 것만 할 수 있습니다.
납부 입력, 수정, 삭제 등 데이터를 변경하는 작업은 절대 할 수 없습니다.
사용자가 납부 입력/등록/기록을 요청하면 "납부 입력은 납부 메뉴에서 직접 해주세요."라고 안내하세요.

규칙:
- 오늘 날짜: {current_date}
- 이번달: {current_month}
- 사용자가 "이번달"이라고 하면 {current_month}을 사용
- 반 이름 매칭: "H반"→"수학H" 또는 "영어H", "중1H" → grade:"중1", class:"수학H"
- 사용자가 과목을 명시하지 않으면 수학을 기본으로 가정
- 질문에 답하기 전에 먼저 list_grades_and_classes로 데이터를 확인해서 정확한 이름을 파악하세요
- 결과를 한국어로 간결하게 요약해서 답변하세요`

// ── Main handler ──

interface ChatMessage {
  role: 'user' | 'model'
  content: string
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' }, { status: 500 })
    }

    const { messages } = (await req.json()) as { messages: ChatMessage[] }

    const now = new Date()
    const currentDate = now.toISOString().split('T')[0]
    const currentMonth = currentDate.slice(0, 7)

    const genAI = new GoogleGenerativeAI(apiKey)
    const geminiTools = getGeminiTools()
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: SYSTEM_PROMPT
        .replace(/{current_date}/g, currentDate)
        .replace(/{current_month}/g, currentMonth),
      tools: geminiTools,
    })

    // Convert to Gemini Content format
    const contents: Content[] = messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }))

    // Tool calling loop (max 8 iterations)
    const toolResults: { tool: string; input: Record<string, string>; result: unknown }[] = []
    let iterations = 0

    while (iterations < 8) {
      iterations++

      const result = await model.generateContent({ contents })
      const response = result.response
      const parts = response.candidates?.[0]?.content?.parts || []

      const functionCalls = parts.filter((p: Part) => p.functionCall)

      if (functionCalls.length === 0) {
        // Final text response
        const text = parts.map((p: Part) => p.text || '').join('')
        return NextResponse.json({
          reply: text,
          actions: toolResults,
        })
      }

      // Add model's response to history
      contents.push({ role: 'model', parts })

      // Execute each function call
      const functionResponses: Part[] = []
      for (const part of functionCalls) {
        const fc = part.functionCall!
        const toolResult = await executeTool(fc.name, fc.args as Record<string, string>)
        toolResults.push({ tool: fc.name, input: fc.args as Record<string, string>, result: toolResult })
        functionResponses.push({
          functionResponse: {
            name: fc.name,
            response: { result: toolResult },
          },
        })
      }

      // Add function responses to history
      contents.push({ role: 'user', parts: functionResponses })
    }

    return NextResponse.json({
      reply: '처리 중 오류가 발생했습니다. 다시 시도해주세요.',
      actions: toolResults,
    })
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error('Agent error:', errMsg)
    return NextResponse.json({ error: `서버 오류: ${errMsg}` }, { status: 500 })
  }
}
