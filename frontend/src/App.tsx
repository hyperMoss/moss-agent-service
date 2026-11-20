import {useCallback, useEffect, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {HStack} from '@astryxdesign/core/HStack';
import {api, streamChat} from './api/client';
import {ChatWorkbench} from './components/ChatWorkbench';
import {ModelSettingsModal} from './components/ModelSettingsModal';
import {RecordsPanel} from './components/RecordsPanel';
import {SopNavigator} from './components/SopNavigator';
import type {
  AfterSalesTicket,
  ChatMessage,
  InvoiceRecord,
  OrderItem,
  RuntimeConfigData,
  ScriptItem,
  SopTree,
  StageType,
  WorkGroupNotification,
} from './types';

export default function App() {
  const [sessionId] = useState(() => `cs-${Date.now()}`);
  const [sop, setSop] = useState<SopTree | null>(null);
  const [scripts, setScripts] = useState<ScriptItem[]>([]);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [tickets, setTickets] = useState<AfterSalesTicket[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [notifications, setNotifications] = useState<WorkGroupNotification[]>([]);
  const [config, setConfig] = useState<RuntimeConfigData | null>(null);

  const [activeStage, setActiveStage] = useState<StageType>('presales');
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [inputValue, setInputValue] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [checklist, setChecklist] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-0',
      role: 'assistant',
      stage: 'presales',
      content:
        '您好！欢迎使用基于 AgentScope 2.0 + React Astryx 构建的地垫智能客服工作台。\n左侧可一键模拟售前/售中/售后典型场景，右侧实时同步售后登记表、发票登记表与工厂/仓库/快递工作群通知。',
    },
  ]);

  const refreshRecords = useCallback(async () => {
    const [tRes, iRes, nRes, oRes] = await Promise.all([
      api.getTickets(),
      api.getInvoices(),
      api.getNotifications(),
      api.getOrders(),
    ]);
    setTickets(tRes.tickets);
    setInvoices(iRes.invoices);
    setNotifications(nRes.notifications);
    setOrders(oRes.orders);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [sopRes, cfgRes] = await Promise.all([api.getSop(), api.getConfig()]);
        setSop(sopRes.sop);
        setScripts(sopRes.scripts);
        setConfig(cfgRes);
        await refreshRecords();
      } catch (err) {
        console.error('初始化加载失败，请确认 FastAPI 后端已启动：', err);
      }
    })();
  }, [refreshRecords]);

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
    };
    const assistantId = `a-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      userMsg,
      {id: assistantId, role: 'assistant', content: '', tool_calls: []},
    ]);
    setInputValue('');
    setLoading(true);

    try {
      await streamChat(
        {
          session_id: sessionId,
          message: text,
          order_id: selectedOrderId || null,
          stage_hint: null,
        },
        {
          onMeta: (meta) => {
            setActiveStage(meta.stage);
            setChecklist(meta.checklist);
          },
          onToolCall: (trace) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {...m, tool_calls: [...(m.tool_calls ?? []), trace]}
                  : m,
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
          onDone: () => {
            void refreshRecords();
          },
        },
      );
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: `请求失败：${String(err)}。请确认 Python 后端服务已在 8000 端口启动。`,
              }
            : m,
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cs-shell">
      <header className="cs-topbar">
        <div>
          <strong style={{fontSize: 16}}>AgentScope 2.0 智能客服系统</strong>
          <span style={{marginLeft: 10, fontSize: 12, color: 'var(--cs-muted)'}}>
            Python (FastAPI + AgentScope) · React 19 + Meta Astryx
          </span>
        </div>
        <HStack gap={2}>
          <Button
            label="模型与红线配置"
            onClick={() => setShowSettings(true)}
          />
        </HStack>
      </header>

      <div className="cs-workspace">
        <SopNavigator
          sop={sop}
          scripts={scripts}
          activeStage={activeStage}
          onStageChange={setActiveStage}
          onQuickPrompt={(text) => setInputValue(text)}
        />

        <ChatWorkbench
          messages={messages}
          inputValue={inputValue}
          onInputChange={setInputValue}
          onSend={handleSend}
          loading={loading}
          orders={orders}
          selectedOrderId={selectedOrderId}
          onOrderChange={setSelectedOrderId}
          activeStage={activeStage}
          checklist={checklist}
          providerLabel={config?.effective_provider ?? 'demo'}
        />

        <RecordsPanel
          tickets={tickets}
          invoices={invoices}
          notifications={notifications}
          onRefresh={() => void refreshRecords()}
        />
      </div>

      {showSettings && config && (
        <ModelSettingsModal
          config={config}
          onClose={() => setShowSettings(false)}
          onSave={async (payload) => {
            const res = await api.updateConfig(payload);
            setConfig(res.config);
          }}
        />
      )}
    </div>
  );
}
