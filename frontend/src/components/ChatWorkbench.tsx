import {Button} from '@astryxdesign/core/Button';
import {HStack} from '@astryxdesign/core/HStack';
import {VStack} from '@astryxdesign/core/VStack';
import type {ChatMessage, OrderItem, StageType} from '../types';

interface ChatWorkbenchProps {
  messages: ChatMessage[];
  inputValue: string;
  onInputChange: (val: string) => void;
  onSend: () => void;
  loading: boolean;
  orders: OrderItem[];
  selectedOrderId: string;
  onOrderChange: (orderId: string) => void;
  activeStage: StageType;
  checklist: string[];
  providerLabel: string;
}

const STAGE_BADGE: Record<StageType, string> = {
  presales: '售前接待',
  insales: '售中跟进',
  aftersales: '售后挽单',
};

export function ChatWorkbench({
  messages,
  inputValue,
  onInputChange,
  onSend,
  loading,
  orders,
  selectedOrderId,
  onOrderChange,
  activeStage,
  checklist,
  providerLabel,
}: ChatWorkbenchProps) {
  return (
    <main className="cs-panel">
      <div className="cs-panel-header">
        <HStack gap={2}>
          <span>智能客服接待台</span>
          <span
            style={{
              fontSize: 12,
              padding: '2px 8px',
              borderRadius: 999,
              background: 'var(--cs-primary-soft)',
              color: 'var(--cs-primary)',
            }}>
            {STAGE_BADGE[activeStage]}
          </span>
        </HStack>
        <span style={{fontSize: 12, color: 'var(--cs-muted)'}}>
          引擎：{providerLabel}
        </span>
      </div>

      {checklist.length > 0 && (
        <div
          style={{
            padding: '10px 16px',
            background: '#fffbeb',
            borderBottom: '1px solid #fde68a',
            fontSize: 12,
          }}>
          <strong style={{color: '#92400e'}}>当前 SOP 必检核对项：</strong>
          <ul style={{margin: '4px 0 0 18px', padding: 0, color: '#78350f'}}>
            {checklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="cs-panel-body">
        <div className="cs-msg-list">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`cs-bubble ${
                msg.role === 'user' ? 'cs-bubble-user' : 'cs-bubble-assistant'
              }`}>
              <div>{msg.content || (loading ? 'AgentScope 正在思考并调用工具...' : '')}</div>
              {msg.tool_calls && msg.tool_calls.length > 0 && (
                <VStack gap={1}>
                  {msg.tool_calls.map((tc, idx) => (
                    <div key={`${tc.tool_name}-${idx}`} className="cs-tool-card">
                      <div>
                        <strong>工具调用：</strong>
                        <code>{tc.tool_name}</code>
                      </div>
                      <div style={{marginTop: 4, color: 'var(--cs-muted)'}}>
                        参数：{JSON.stringify(tc.arguments)}
                      </div>
                      {Object.keys(tc.result || {}).length > 0 && (
                        <div style={{marginTop: 4}}>
                          结果：{JSON.stringify(tc.result)}
                        </div>
                      )}
                    </div>
                  ))}
                </VStack>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="cs-composer">
        <HStack gap={2}>
          <label style={{fontSize: 12, color: 'var(--cs-muted)'}}>
            关联测试订单：
          </label>
          <select
            className="cs-select"
            value={selectedOrderId}
            onChange={(e) => onOrderChange(e.target.value)}>
            <option value="">不指定订单（自动从对话提取）</option>
            {orders.map((o) => (
              <option key={o.order_id} value={o.order_id}>
                {o.order_id} · {o.order_type === 'custom' ? '定制' : '页面尺寸'} ·{' '}
                {o.status === 'unshipped' ? '未发货' : '已发货'} · {o.buyer_name}
              </option>
            ))}
          </select>
        </HStack>

        <textarea
          className="cs-textarea"
          placeholder="输入客户咨询内容（支持售前报价/定制核对、售中催发/改址/发票、售后品质/个人/物流问题），按 Ctrl+Enter 发送..."
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !loading) {
              onSend();
            }
          }}
        />

        <div style={{display: 'flex', justifyContent: 'flex-end'}}>
          <Button
            label={loading ? '生成中...' : '发送消息'}
            onClick={onSend}
          />
        </div>
      </div>
    </main>
  );
}
