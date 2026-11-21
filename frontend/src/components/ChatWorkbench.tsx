import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {HStack} from '@astryxdesign/core/HStack';
import {VStack} from '@astryxdesign/core/VStack';
import {api} from '../api/client';
import type {ChatMessage, OrderItem, StageType} from '../types';

interface ChatWorkbenchProps {
  messages: ChatMessage[];
  inputValue: string;
  onInputChange: (val: string) => void;
  onSend: () => void;
  onRateMessage: (msg: ChatMessage, rating: 'up' | 'down', tag?: string) => void;
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

const BADCASE_TAGS = ['折扣越权', 'SOP漏检', '漏查订单', '话术生硬', '长尾未覆盖'];

export function ChatWorkbench({
  messages,
  inputValue,
  onInputChange,
  onSend,
  onRateMessage,
  loading,
  orders,
  selectedOrderId,
  onOrderChange,
  activeStage,
  checklist,
  providerLabel,
}: ChatWorkbenchProps) {
  const [mediaTip, setMediaTip] = useState<string>('');
  const [downTargetId, setDownTargetId] = useState<string | null>(null);

  const handleAnalyzeFile = async (filename: string, caption = '') => {
    const res = await api.analyzeMedia({filename, caption, media_type: 'image'});
    setMediaTip(
      `已解析多模态线索（${res.filename}）：${res.extracted_clues.join(' ')} ｜ 待确认：${res.uncertainties.join(' ')}`,
    );
    onInputChange(
      inputValue ? `${inputValue}\n${res.prompt_injection}` : res.prompt_injection,
    );
  };

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
              id={msg.id}
              tabIndex={-1}
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
                    </div>
                  ))}
                </VStack>
              )}

              {msg.decision_trace && (
                <details
                  style={{
                    marginTop: 8,
                    padding: '6px 10px',
                    borderRadius: 8,
                    background: msg.decision_trace.guardrail_passed ? '#ecfdf5' : '#fef2f2',
                    border: `1px solid ${msg.decision_trace.guardrail_passed ? '#a7f3d0' : '#fecaca'}`,
                    fontSize: 12,
                  }}>
                  <summary style={{cursor: 'pointer', fontWeight: 600}}>
                    双本体决策轨迹 · {msg.decision_trace.service_node_id} / {msg.decision_trace.decision_rule_id} ·{' '}
                    {msg.decision_trace.guardrail_passed ? '二次校验通过' : '触发越权拦截'}
                  </summary>
                  <div style={{marginTop: 6}}>
                    <div><strong>允许动作：</strong>{msg.decision_trace.allowed_actions.join('；')}</div>
                    <div style={{marginTop: 4}}><strong>禁止动作：</strong>{msg.decision_trace.blocked_actions.join('；')}</div>
                    {msg.decision_trace.violations.length > 0 && (
                      <div style={{marginTop: 4, color: 'var(--cs-danger)'}}>
                        <strong>拦截记录：</strong>{msg.decision_trace.violations.join('；')}
                      </div>
                    )}
                  </div>
                </details>
              )}

              {msg.role === 'assistant' && msg.id !== 'welcome-0' && (
                <div style={{marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap'}}>
                  <button
                    type="button"
                    onClick={() => onRateMessage(msg, 'up')}
                    style={{
                      fontSize: 11,
                      padding: '2px 8px',
                      borderRadius: 6,
                      border: '1px solid var(--cs-border)',
                      background: msg.rated === 'up' ? '#dcfce7' : '#ffffff',
                      cursor: 'pointer',
                    }}>
                    👍 准确合规
                  </button>
                  <button
                    type="button"
                    onClick={() => setDownTargetId(downTargetId === msg.id ? null : msg.id)}
                    style={{
                      fontSize: 11,
                      padding: '2px 8px',
                      borderRadius: 6,
                      border: '1px solid var(--cs-border)',
                      background: msg.rated === 'down' ? '#fee2e2' : '#ffffff',
                      cursor: 'pointer',
                    }}>
                    👎 点踩进 Badcase 闭环
                  </button>
                  {downTargetId === msg.id && (
                    <div style={{display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4}}>
                      {BADCASE_TAGS.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => {
                            onRateMessage(msg, 'down', tag);
                            setDownTargetId(null);
                          }}
                          style={{
                            fontSize: 11,
                            padding: '2px 8px',
                            borderRadius: 999,
                            border: '1px solid #fca5a5',
                            background: '#fff1f2',
                            color: '#b91c1c',
                            cursor: 'pointer',
                          }}>
                          + {tag}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="cs-composer">
        <HStack gap={2}>
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

          <label
            style={{
              fontSize: 12,
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid var(--cs-border)',
              background: '#f9fafb',
              cursor: 'pointer',
            }}>
            上传破损/效果图解析
            <input
              type="file"
              accept="image/*,video/*"
              style={{display: 'none'}}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleAnalyzeFile(file.name);
              }}
            />
          </label>

          <button
            type="button"
            onClick={() => void handleAnalyzeFile('快递外包装破损面单.jpg', '外包装磨破')}
            style={{
              fontSize: 12,
              padding: '6px 10px',
              borderRadius: 8,
              border: '1px solid var(--cs-border)',
              background: '#ffffff',
              cursor: 'pointer',
            }}>
            模拟面单破损图
          </button>
        </HStack>

        {mediaTip && (
          <div style={{fontSize: 12, color: '#0369a1', background: '#f0f9ff', padding: '6px 10px', borderRadius: 8}}>
            {mediaTip}
          </div>
        )}

        <textarea
          className="cs-textarea"
          placeholder="输入客户咨询内容，按 Ctrl+Enter 发送..."
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !loading) {
              onSend();
            }
          }}
        />

        <div style={{display: 'flex', justifyContent: 'flex-end'}}>
          <Button label={loading ? '生成中...' : '发送消息'} onClick={onSend} />
        </div>
      </div>
    </main>
  );
}
