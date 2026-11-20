export type StageType = 'presales' | 'insales' | 'aftersales';

export interface ToolCallTrace {
  tool_name: string;
  arguments: Record<string, unknown>;
  result: Record<string, unknown>;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  stage?: StageType;
  intent?: string;
  tool_calls?: ToolCallTrace[];
  checklist?: string[];
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
