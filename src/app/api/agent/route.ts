import { NextResponse } from 'next/server'
import { GoogleGenerativeAI, SchemaType, Content, Part, type Tool } from '@google/generative-ai'
import { supabase } from '@/lib/supabase'

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
    name: 'create_payments_for_class',
    description: '특정 반의 재원생 전원에 대해 납부 기록을 일괄 생성합니다.',
    parameters: {
      type: 'OBJECT',
      properties: {
        grade_name: { type: 'STRING', description: '학년 이름 (예: 중1, 고2)' },
        class_name: { type: 'STRING', description: '반 이름 (예: 수학H, 영어A)' },
        method: { type: 'STRING', description: '납부 방법: remote(결제선생), card(카드결제), transfer(계좌이체), cash(현금)', enum: ['remote', 'card', 'transfer', 'cash'] },
        billing_month: { type: 'STRING', description: '납부 대상월 (YYYY-MM 형식)' },
        amount: { type: 'STRING', description: '납부 금액 (숫자 문자열). 생략하면 기본 원비 사용' },
        cash_receipt: { type: 'STRING', description: '현금영수증 발행여부. 계좌이체/현금일 때만: issued(발행완료), pending(미발행)' },
      },
      required: ['grade_name', 'class_name', 'method', 'billing_month'],
    },
  },
  {
    name: 'create_payment_for_student',
    description: '특정 학생에 대해 납부 기록을 생성합니다.',
    parameters: {
      type: 'OBJECT',
      properties: {
        student_name: { type: 'STRING', description: '학생 이름' },
        method: { type: 'STRING', description: '납부 방법', enum: ['remote', 'card', 'transfer', 'cash'] },
        billing_month: { type: 'STRING', description: '납부 대상월 (YYYY-MM)' },
        amount: { type: 'STRING', description: '납부 금액 (숫자 문자열)' },
        cash_receipt: { type: 'STRING', description: '현금영수증 발행여부: issued(발행완료), pending(미발행)' },
      },
      required: ['student_name', 'method', 'billing_month'],
    },
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

// ── Tool execution ──

async function listGradesAndClasses() {
  const { data, error } = await supabase
    .from('tuition_grades')
    .select('*, tuition_classes(*, tuition_students(*))')
    .order('order_index')

  if (error) return { error: error.message }

  return (data ?? []).map(g => ({
    grade: g.name,
    classes: (g.tuition_classes ?? []).map((c: Record<string, unknown>) => ({
      name: c.name,
      subject: c.subject,
      monthly_fee: c.monthly_fee,
      students: ((c.tuition_students as Record<string, unknown>[]) ?? [])
        .filter((s: Record<string, unknown>) => !s.withdrawal_date)
        .map((s: Record<string, unknown>) => ({
          name: s.name,
          custom_fee: s.custom_fee,
          id: s.id,
        })),
    })),
  }))
}

async function createPaymentsForClass(args: Record<string, string>) {
  const { data: grades } = await supabase
    .from('tuition_grades')
    .select('*, tuition_classes(*, tuition_students(*))')
    .order('order_index')

  if (!grades) return { error: '데이터 조회 실패' }

  let targetClass: Record<string, unknown> | null = null
  let gradeName = ''

  for (const g of grades) {
    if (!g.name.includes(args.grade_name.replace(/\s/g, ''))) continue
    for (const c of (g.tuition_classes ?? [])) {
      if (c.name === args.class_name || c.name.includes(args.class_name.replace(/\s/g, ''))) {
        targetClass = c
        gradeName = g.name
        break
      }
    }
    if (targetClass) break
  }

  if (!targetClass) return { error: `${args.grade_name} ${args.class_name} 반을 찾을 수 없습니다` }

  const students = ((targetClass.tuition_students as Record<string, unknown>[]) ?? [])
    .filter((s: Record<string, unknown>) => !s.withdrawal_date)

  if (students.length === 0) return { error: '해당 반에 재원생이 없습니다' }

  const defaultFee = targetClass.monthly_fee as number
  const overrideAmount = args.amount ? parseInt(args.amount) : undefined
  const results: string[] = []

  for (const s of students) {
    const studentFee = (s.custom_fee as number | null) ?? defaultFee
    const payAmount = overrideAmount ?? studentFee

    const cashReceipt = (args.method === 'transfer' || args.method === 'cash') ? (args.cash_receipt || 'pending') : null
    const { error } = await supabase.from('tuition_payments').insert({
      student_id: s.id,
      amount: payAmount,
      method: args.method,
      payment_date: new Date().toISOString().split('T')[0],
      billing_month: args.billing_month,
      cash_receipt: cashReceipt,
    })

    const METHOD_KR: Record<string, string> = { remote: '결제선생', card: '카드결제', transfer: '계좌이체', cash: '현금' }
    const methodLabel = METHOD_KR[args.method] ?? args.method
    results.push(error ? `${s.name}: 오류 - ${error.message}` : `${s.name}: ${payAmount.toLocaleString()}원 ${methodLabel}`)
  }

  return { message: `${gradeName} ${targetClass.name} 반 ${students.length}명 납부 기록 완료`, details: results }
}

async function createPaymentForStudent(args: Record<string, string>) {
  const { data: students } = await supabase
    .from('tuition_students')
    .select('*, tuition_classes(monthly_fee)')
    .ilike('name', `%${args.student_name}%`)
    .is('withdrawal_date', null)

  if (!students || students.length === 0) return { error: `"${args.student_name}" 학생을 찾을 수 없습니다` }
  if (students.length > 1) {
    return { error: `"${args.student_name}"에 해당하는 학생이 ${students.length}명: ${students.map((s: Record<string, unknown>) => s.name).join(', ')}` }
  }

  const student = students[0]
  const fee = (student.custom_fee as number | null) ?? (student.tuition_classes as Record<string, unknown>)?.monthly_fee ?? 0
  const payAmount = args.amount ? parseInt(args.amount) : fee

  const cashReceipt = (args.method === 'transfer' || args.method === 'cash') ? (args.cash_receipt || 'pending') : null
  const { error } = await supabase.from('tuition_payments').insert({
    student_id: student.id,
    amount: payAmount,
    method: args.method,
    payment_date: new Date().toISOString().split('T')[0],
    billing_month: args.billing_month,
    cash_receipt: cashReceipt,
  })

  if (error) return { error: error.message }
  const METHOD_KR: Record<string, string> = { remote: '결제선생', card: '카드결제', transfer: '계좌이체', cash: '현금' }
  const methodLabel = METHOD_KR[args.method] ?? args.method
  return { message: `${student.name}: ${payAmount.toLocaleString()}원 ${methodLabel} 납부 완료 (${args.billing_month})` }
}

async function getUnpaidStudents(args: Record<string, string>) {
  const { data: grades } = await supabase
    .from('tuition_grades')
    .select('*, tuition_classes(*, tuition_students(*))')
    .order('order_index')

  if (!grades) return { error: '데이터 조회 실패' }

  const { data: payments } = await supabase
    .from('tuition_payments')
    .select('student_id, amount')
    .eq('billing_month', args.billing_month)

  const paidMap: Record<string, number> = {}
  for (const p of (payments ?? [])) {
    paidMap[p.student_id] = (paidMap[p.student_id] ?? 0) + p.amount
  }

  const unpaid: { grade: string; class_name: string; name: string; fee: number; paid: number }[] = []
  for (const g of grades) {
    for (const c of (g.tuition_classes ?? [])) {
      for (const s of (c.tuition_students ?? [])) {
        if (s.withdrawal_date) continue
        const fee = (s.custom_fee as number | null) ?? (c.monthly_fee as number)
        const paid = paidMap[s.id as string] ?? 0
        if (paid < fee) unpaid.push({ grade: g.name, class_name: c.name, name: s.name, fee, paid })
      }
    }
  }

  return { billing_month: args.billing_month, total_unpaid: unpaid.length, students: unpaid }
}

async function getPaymentStatusByMonth(args: Record<string, string>) {
  const { data: grades } = await supabase
    .from('tuition_grades')
    .select('*, tuition_classes(*, tuition_students(*))')
    .order('order_index')

  if (!grades) return { error: '데이터 조회 실패' }

  const { data: payments } = await supabase
    .from('tuition_payments')
    .select('student_id, amount')
    .eq('billing_month', args.billing_month)

  const paidMap: Record<string, number> = {}
  for (const p of (payments ?? [])) {
    paidMap[p.student_id] = (paidMap[p.student_id] ?? 0) + p.amount
  }

  const result = []
  for (const g of grades) {
    for (const c of (g.tuition_classes ?? [])) {
      const activeStudents = (c.tuition_students ?? []).filter((s: Record<string, unknown>) => !s.withdrawal_date)
      let paidCount = 0, totalFee = 0, totalPaid = 0

      for (const s of activeStudents) {
        const fee = (s.custom_fee as number | null) ?? (c.monthly_fee as number)
        const paid = paidMap[s.id as string] ?? 0
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
}

async function executeTool(name: string, args: Record<string, string>): Promise<unknown> {
  switch (name) {
    case 'list_grades_and_classes': return listGradesAndClasses()
    case 'create_payments_for_class': return createPaymentsForClass(args)
    case 'create_payment_for_student': return createPaymentForStudent(args)
    case 'get_unpaid_students': return getUnpaidStudents(args)
    case 'get_payment_status': return getPaymentStatusByMonth(args)
    default: return { error: `알 수 없는 도구: ${name}` }
  }
}

// ── System prompt ──

const SYSTEM_PROMPT = `당신은 학원 원비관리 시스템의 AI 어시스턴트입니다.
사용자의 자연어 명령을 해석해서 적절한 도구를 호출하여 작업을 수행합니다.

규칙:
- 오늘 날짜: {current_date}
- 이번달: {current_month}
- 사용자가 "이번달"이라고 하면 {current_month}을 사용
- 납부 방법: "결제선생"/"원격결제"→remote, "카드"/"카드결제"→card, "이체"/"계좌이체"→transfer, "현금"→cash
- 현금영수증: 계좌이체/현금 결제 시 cash_receipt를 issued(발행완료) 또는 pending(미발행)으로 설정. 사용자가 언급하지 않으면 pending으로 기본 설정
- 반 이름 매칭: "H반"→"수학H" 또는 "영어H", "중1H" → grade:"중1", class:"수학H"
- 사용자가 과목을 명시하지 않으면 수학을 기본으로 가정
- 작업 전에 먼저 list_grades_and_classes로 데이터를 확인해서 정확한 이름을 파악하세요
- 결과를 한국어로 간결하게 요약해서 답변하세요
- 납부 기록 생성 시 금액을 명시하지 않으면 해당 반/학생의 기본 원비를 사용합니다`

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
