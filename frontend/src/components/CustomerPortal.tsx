import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {HStack} from '@astryxdesign/core/HStack';
import {ServiceOntology} from './ServiceOntology';
import {api, streamChat} from '../api/client';
import type {ChatMessage} from '../types';

interface CustomerPortalProps {
  onNavigateAdmin: () => void;
}

const CUSTOMER_QUICK_QUESTIONS = [
  '我想按门口尺寸定制一块地垫，怎么报价？',
  '页面现货尺寸的地垫有优惠吗？',
  '帮我查一下订单 DD20261116003 的物流进度',
  '刚收到的地垫有轻微味道和色差怎么办？',
  '我需要开具公司电子/线下发票',
];

/**
 * 纯面向终端买家的独立前台客服页面（路径：/ 或 /chat）。
 * 隐藏所有商家后台 SOP 红线、工作群流转、DecisionTrace 与评测面板，仅保留极简友好的客服体验。
 */
export function CustomerPortal({onNavigateAdmin}: CustomerPortalProps) {
  const [sessionId] = useState(() => `buyer-${Date.now()}`);
  const [orderId, setOrderId] = useState('');
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadTip, setUploadTip] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'buyer-welcome',
      role: 'assistant',
      content:
        '您好亲～欢迎来到地垫定制官方旗舰店！\n无论是挑选现货尺寸、按场地定制 LOGO/异形地垫，还是查询物流、申请开票或售后处理，直接告诉我就可以哦～',
    },
  ]);

  const handleSend = async (overrideText?: string) => {
    const text = (overrideText ?? inputValue).trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: `bu-${Date.now()}`,
      role: 'user',
      content: text,
    };
    const assistantId = `ba-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      userMsg,
      {id: assistantId, role: 'assistant', content: ''},
    ]);
    if (!overrideText) setInputValue('');
    setUploadTip('');
    setLoading(true);

    try {
      await streamChat(
        {
          session_id: sessionId,
          message: text,
          order_id: orderId.trim() || null,
          stage_hint: null,
        },
        {
          onMeta: (meta) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {...m, stage: meta.stage, intent: meta.intent}
                  : m,
              ),
            );
          },
          onToolCall: (trace) => {
            setMessages(prev => prev.map(m => m.id === assistantId ? {...m, tool_calls: [...(m.tool_calls ?? []), trace]} : m));
          },
          onDecisionTrace: (trace) => {
            // 仅静默暂存于前端状态，供点踩满意度反馈时回传后台 Badcase 队列，不对客户展示
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? {...m, decision_trace: trace} : m,
              ),
            );
          },
          onDelta: (delta) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? {...m, content: m.content + delta} : m,
              ),
            );
          },
        },
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {...m, content: '抱歉亲，当前客服线路繁忙，请稍后再试或联系人工客服～'}
            : m,
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleUploadImage = async (filename: string) => {
    try {
      const res = await api.analyzeMedia({filename, media_type: 'image'});
      setUploadTip(`已收到您的图片「${filename}」，系统已自动识别相关线索并附在输入框中。`);
      setInputValue((prev) =>
        prev ? `${prev}\n${res.prompt_injection}` : res.prompt_injection,
      );
    } catch {
      setUploadTip(`已选择图片「${filename}」。`);
    }
  };

  const handleFeedback = async (msg: ChatMessage, rating: 'up' | 'down') => {
    const idx = messages.findIndex((m) => m.id === msg.id);
    const prevUser = idx > 0 ? messages[idx - 1] : null;
    await api.submitFeedback({
      session_id: sessionId,
      message_id: msg.id,
      rating,
      tag: rating === 'down' ? '客户前台反馈未解决' : '',
      user_query: prevUser?.content ?? '',
      assistant_reply: msg.content,
      stage: msg.stage ?? 'presales',
      intent: msg.intent ?? '',
      decision_trace: msg.decision_trace ?? {},
    });
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? {...m, rated: rating} : m)),
    );
  };

  return (
    <div className="cs-customer-shell">
      <div className="cs-customer-card">
        <header className="cs-customer-header">
          <div>
            <div style={{fontSize: 16, fontWeight: 700}}>地垫定制官方旗舰店 · 在线客服</div>
            <div style={{fontSize: 12, color: 'var(--cs-success)', marginTop: 2}}>
              ● 7×24 小时智能接待在线
            </div>
          </div>
          <button
            type="button"
            onClick={onNavigateAdmin}
            style={{
              fontSize: 12,
              color: 'var(--cs-muted)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}>
            商家后台入口
          </button>
        </header>

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
                <div>{msg.content || (loading ? '客服正在为您核查回复...' : '')}</div>

                {msg.role === 'assistant' && msg.id !== 'buyer-welcome' && (
                  <div style={{marginTop: 8, display: 'flex', gap: 8, alignItems: 'center'}}>
                    <span style={{fontSize: 11, color: 'var(--cs-muted)'}}>
                      本次回答是否有帮助？
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleFeedback(msg, 'up')}
                      style={{
                        fontSize: 11,
                        padding: '2px 8px',
                        borderRadius: 999,
                        border: '1px solid var(--cs-border)',
                        background: msg.rated === 'up' ? '#dcfce7' : '#ffffff',
                        cursor: 'pointer',
                      }}>
                      已解决
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleFeedback(msg, 'down')}
                      style={{
                        fontSize: 11,
                        padding: '2px 8px',
                        borderRadius: 999,
                        border: '1px solid var(--cs-border)',
                        background: msg.rated === 'down' ? '#fee2e2' : '#ffffff',
                        cursor: 'pointer',
                      }}>
                      未解决
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 快捷常见问题引导 */}
          <div style={{marginTop: 18}}>
            <div style={{fontSize: 12, color: 'var(--cs-muted)', marginBottom: 8}}>
              您可能想咨询：
            </div>
            <div style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
              {CUSTOMER_QUICK_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => void handleSend(q)}
                  style={{
                    fontSize: 12,
                    padding: '6px 12px',
                    borderRadius: 999,
                    border: '1px solid #bfdbfe',
                    background: '#eff6ff',
                    color: '#1d4ed8',
                    cursor: 'pointer',
                  }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="cs-composer">
          <HStack gap={2}>
            <input
              type="text"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="可选填您的订单号（如 DD20261116003）"
              style={{
                flex: 1,
                padding: '6px 10px',
                borderRadius: 8,
                border: '1px solid var(--cs-border)',
                fontSize: 12,
              }}
            />
            <label
              style={{
                fontSize: 12,
                padding: '6px 10px',
                borderRadius: 8,
                border: '1px solid var(--cs-border)',
                background: '#f9fafb',
                cursor: 'pointer',
              }}>
              发送图片/草图
              <input
                type="file"
                accept="image/*,video/*"
                style={{display: 'none'}}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleUploadImage(file.name);
                }}
              />
            </label>
          </HStack>

          {uploadTip && (
            <div style={{fontSize: 12, color: '#0369a1'}}>{uploadTip}</div>
          )}

          <textarea
            className="cs-textarea"
            placeholder="请输入您的问题，按 Ctrl+Enter 发送..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !loading) {
                void handleSend();
              }
            }}
          />

          <div style={{display: 'flex', justifyContent: 'flex-end'}}>
            <Button
              label={loading ? '发送中...' : '发送'}
              onClick={() => void handleSend()}
            />
          </div>
        </div>
      </div>
      <ServiceOntology messages={messages} />
    </div>
  );
}
