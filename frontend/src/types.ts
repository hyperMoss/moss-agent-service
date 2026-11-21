export type StageType = 'presales' | 'insales' | 'aftersales';

export interface ToolCallTrace {
  tool_name: string;
  arguments: Record<string, unknown>;
  result: Record<string, unknown>;
}

export interface DecisionTrace {
  service_node_id: string;
  decision_rule_id: string;
  allowed_actions: string[];
  blocked_actions: string[];
  guardrail_passed: boolean;
  violations: string[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  stage?: StageType;
  intent?: string;
  tool_calls?: ToolCallTrace[];
  checklist?: string[];
  decision_trace?: DecisionTrace;
  rated?: 'up' | 'down';
}

export interface OrderItem {
  order_id: string;
  buyer_name: string;
  order_type: 'page_size' | 'custom';
  has_code: number;
  product_name: string;
  amount: number;
  status: 'unshipped' | 'shipped' | 'delivered';
  production_owner: 'factory' | 'warehouse';
  courier: string;
  tracking_no: string;
  logistics_stalled_hours: number;
  shipping_address: string;
  custom_notes: string;
}

export interface AfterSalesTicket {
  id: number;
  order_id: string;
  category: 'quality' | 'personal' | 'logistics';
  sub_reason: string;
  source_party: string;
  discount_offered: number | null;
  resolution: string;
  notes: string;
  created_at: string;
}

export interface InvoiceRecord {
  id: number;
  order_id: string;
  buyer_title: string;
  tax_id: string;
  amount: number;
  email: string;
  notes: string;
  created_at: string;
}

export interface WorkGroupNotification {
  id: number;
  group_type: string;
  order_id: string;
  summary: string;
  created_at: string;
}

export interface ScriptItem {
  id: string;
  stage: StageType;
  title: string;
  tag: string;
  content: string;
}

export interface SopBranch {
  id: string;
  name: string;
  summary: string;
  rules: string[];
}

export interface SopTree {
  presales: {title: string; welcome: string; branches: SopBranch[]};
  insales: {title: string; branches: SopBranch[]};
  aftersales: {title: string; branches: SopBranch[]};
}

export interface RuntimeConfigData {
  model_provider: 'dashscope' | 'openai' | 'demo';
  effective_provider: string;
  agentscope_installed: boolean;
  dashscope_model: string;
  dashscope_key_configured: boolean;
  openai_base_url: string;
  openai_model: string;
  openai_key_configured: boolean;
  presales_page_min_discount: number;
  aftersales_quality_min_discount: number;
  aftersales_personal_min_discount: number;
  logistics_stall_hours_threshold: number;
}

export interface AttributionRuleMeta {
  code: string;
  short: string;
  name: string;
  definition: string;
  advice: string;
}

export interface AttributionRow {
  row_no: number;
  source: 'snapshot' | 'live_db';
  order_id: string;
  sku_name: string;
  category: string;
  issue_code: string;
  source_party: string;
  original_text: string;
  discount_offered: number | null;
  resolution: string;
  knowledge_coverage: string;
  rule_codes: string[];
  order_snapshot: Record<string, unknown>;
}

export interface AttributionDashboard {
  mode: string;
  guardrail_notice: string;
  total_tickets: number;
  snapshot_count: number;
  live_count: number;
  sku_ranking: Array<{sku_name: string; count: number; row_numbers: number[]}>;
  issue_code_ranking: Array<{issue_code: string; count: number; row_numbers: number[]}>;
  category_distribution: Array<{category: string; count: number}>;
  emotion_leads: Array<{
    row_no: number;
    order_id: string;
    sku_name: string;
    matched_words: string[];
    original_text: string;
  }>;
  rule_cards: Array<{
    rule: AttributionRuleMeta;
    count: number;
    row_numbers: number[];
    sample_orders: string[];
  }>;
  rows_by_number: Record<string, AttributionRow>;
  suggested_questions: string[];
}

export interface AttributionAnswer {
  question: string;
  answer: string;
  rule: AttributionRuleMeta;
  cited_rows: number[];
  guardrail: string;
}

export interface BadcaseItem {
  id: number;
  session_id: string;
  message_id: string;
  rating: 'up' | 'down';
  tag: string;
  user_query: string;
  assistant_reply: string;
  stage: StageType;
  intent: string;
  decision_trace: DecisionTrace;
  comment: string;
  status: 'pending' | 'reviewed' | 'resolved';
  fix_proposal: string;
  created_at: string;
}

export interface DatasetCatalogItem {
  id: string;
  name: string;
  source_url: string;
  language: string;
  size: number;
  description: string;
}

export interface BenchmarkCaseResult {
  id: string;
  category: string;
  query: string;
  expected_stage: string;
  actual_stage: string;
  expected_intent: string;
  actual_intent: string;
  stage_ok: boolean;
  intent_ok: boolean;
  keyword_ok: boolean;
  guardrail_ok: boolean;
  decision_rule_id: string;
  tools_invoked: string[];
  latency_ms: number;
  reply_preview: string;
}

export interface BenchmarkRunResult {
  total_cases: number;
  stage_accuracy: number;
  intent_accuracy: number;
  keyword_pass_rate: number;
  guardrail_pass_rate: number;
  catalog: DatasetCatalogItem[];
  cases: BenchmarkCaseResult[];
}

export interface DemoCase {
  id: string;
  title: string;
  stage: StageType;
  order_id: string;
  question: string;
  expected: string;
}
