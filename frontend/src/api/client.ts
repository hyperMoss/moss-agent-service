import type {
  AfterSalesTicket,
  AttributionAnswer,
  AttributionDashboard,
  BadcaseItem,
  BenchmarkRunResult,
  DatasetCatalogItem,
  DecisionTrace,
  InvoiceRecord,
  OrderItem,
  RuntimeConfigData,
  ScriptItem,
  SopTree,
  StageType,
  ToolCallTrace,
  WorkGroupNotification,
} from '../types';

const API_BASE = '/api';

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {'Content-Type': 'application/json', ...(init?.headers ?? {})},
    ...init,
  });
  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getSop: () => requestJson<{sop: SopTree; scripts: ScriptItem[]}>('/sop'),
  getOrders: () => requestJson<{orders: OrderItem[]}>('/orders'),
  getTickets: () => requestJson<{tickets: AfterSalesTicket[]}>('/tickets'),
  getInvoices: () => requestJson<{invoices: InvoiceRecord[]}>('/invoices'),
  getNotifications: () =>
    requestJson<{notifications: WorkGroupNotification[]}>('/notifications'),
  getConfig: () => requestJson<RuntimeConfigData>('/config'),
  updateConfig: (payload: Record<string, unknown>) =>
    requestJson<{ok: boolean; config: RuntimeConfigData}>('/config', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  analyzeMedia: (payload: {filename: string; caption?: string; media_type?: 'image' | 'video'}) =>
    requestJson<{
      filename: string;
      suggested_stage: StageType;
      suggested_intent: string;
      extracted_clues: string[];
      uncertainties: string[];
      prompt_injection: string;
    }>('/multimodal/analyze', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  submitFeedback: (payload: Record<string, unknown>) =>
    requestJson<{ok: boolean; record: BadcaseItem}>('/feedback', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getBadcases: () => requestJson<{badcases: BadcaseItem[]}>('/badcases'),
  updateBadcase: (id: number, payload: {status: string; fix_proposal: string}) =>
    requestJson<{ok: boolean}>(`/badcases/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  getAttributionDashboard: () =>
    requestJson<AttributionDashboard>('/analytics/dashboard'),
  askAttribution: (question: string) =>
    requestJson<AttributionAnswer>('/analytics/ask', {
      method: 'POST',
      body: JSON.stringify({question}),
    }),
  getBenchmarkCatalog: () =>
    requestJson<{catalog: DatasetCatalogItem[]}>('/benchmark/catalog'),
  runBenchmark: () =>
    requestJson<BenchmarkRunResult>('/benchmark/run', {method: 'POST'}),
};

export interface StreamCallbacks {
  onMeta?: (meta: {
    stage: StageType;
    intent: string;
    order_id?: string | null;
    provider: string;
    checklist: string[];
    suggested_scripts: ScriptItem[];
  }) => void;
  onToolCall?: (trace: ToolCallTrace) => void;
  onDecisionTrace?: (trace: DecisionTrace) => void;
  onDelta?: (text: string) => void;
  onDone?: (payload: {
    reply: string;
    stage: StageType;
    intent: string;
    tool_calls: ToolCallTrace[];
    decision_trace?: DecisionTrace;
  }) => void;
}

export async function streamChat(
  body: {
    session_id: string;
    message: string;
    order_id?: string | null;
    stage_hint?: StageType | null;
  },
  callbacks: StreamCallbacks,
): Promise<void> {
  const res = await fetch(`${API_BASE}/chat/stream`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    throw new Error(`Stream request failed: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const {value, done} = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, {stream: true});
    const frames = buffer.split('\n\n');
    buffer = frames.pop() ?? '';

    for (const frame of frames) {
      let eventName = 'message';
      let dataStr = '';
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataStr += line.slice(5).trim();
        }
      }
      if (!dataStr) continue;
      const parsed = JSON.parse(dataStr);
      if (eventName === 'meta') callbacks.onMeta?.(parsed);
      else if (eventName === 'tool_call') callbacks.onToolCall?.(parsed);
      else if (eventName === 'decision_trace') callbacks.onDecisionTrace?.(parsed);
      else if (eventName === 'delta') callbacks.onDelta?.(parsed.text ?? '');
      else if (eventName === 'done') callbacks.onDone?.(parsed);
    }
  }
}
