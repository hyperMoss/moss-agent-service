import {useCallback, useEffect, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {VStack} from '@astryxdesign/core/VStack';
import {api, streamChat} from './api/client';
import {AttributionView} from './components/AttributionView';
import {BadcaseView} from './components/BadcaseView';
import {BenchmarkView} from './components/BenchmarkView';
import {ChatWorkbench} from './components/ChatWorkbench';
import {CustomerPortal} from './components/CustomerPortal';
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

type AdminTab = 'chat' | 'attribution' | 'badcases' | 'benchmark';

function parseRoute(pathname: string): {mode: 'customer' | 'admin'; tab: AdminTab} {
  if (pathname.startsWith('/admin')) {
    if (pathname.startsWith('/admin/attribution')) return {mode: 'admin', tab: 'attribution'};
    if (pathname.startsWith('/admin/badcases')) return {mode: 'admin', tab: 'badcases'};
    if (pathname.startsWith('/admin/benchmark')) return {mode: 'admin', tab: 'benchmark'};
    return {mode: 'admin', tab: 'chat'};
  }
  return {mode: 'customer', tab: 'chat'};
}

const ADMIN_NAV_ITEMS: Array<{tab: AdminTab; path: string; title: string; desc: string}> = [
  {tab: 'chat', path: '/admin/chat', title: '智能坐席', desc: 'SOP 引导 · 工具轨迹 · 台账'},
  {tab: 'attribution', path: '/admin/attribution', title: '经营归因与决策', desc: '双页签看板 · 原文下钻抽屉'},
  {tab: 'badcases', path: '/admin/badcases', title: 'Badcase 自进化', desc: '点踩捕获 · 复核修复闭环'},
  {tab: 'benchmark', path: '/admin/benchmark', title: '评测与数据集', desc: '20条SOP回归 · 公开数据集'},
];

export default function App() {
  const [pathname, setPathname] = useState<string>(() => window.location.pathname || '/');
  const route = parseRoute(pathname);

  const navigate = useCallback((nextPath: string) => {
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
    setPathname(nextPath);
  }, []);

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname || '/');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

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
        '欢迎进入 AgentScope 2.0 × Onto 商家客服管理后台。\n右侧竖向导航栏可随时切换「智能坐席」「经营归因与决策」「Badcase 自进化」与「评测与数据集」。',
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
    if (route.mode !== 'admin') return;
    void (async () => {
      try {
        const [sopRes, cfgRes] = await Promise.all([api.getSop(), api.getConfig()]);
        setSop(sopRes.sop);
        setScripts(sopRes.scripts);
        setConfig(cfgRes);
        await refreshRecords();
      } catch (err) {
        console.error('后台初始化加载失败，请确认 FastAPI 后端已启动：', err);
      }
    })();
  }, [route.mode, refreshRecords]);

  // 路径 `/` 或 `/chat` 渲染纯面向客户的独立前台页面
  if (route.mode === 'customer') {
    return <CustomerPortal onNavigateAdmin={() => navigate('/admin/chat')} />;
  }

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
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {...m, stage: meta.stage, intent: meta.intent}
                  : m,
              ),
            );
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
          onDecisionTrace: (trace) => {
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

  const handleRateMessage = async (
    msg: ChatMessage,
    rating: 'up' | 'down',
    tag = '',
  ) => {
    const idx = messages.findIndex((m) => m.id === msg.id);
    const prevUser = idx > 0 ? messages[idx - 1] : null;
    await api.submitFeedback({
      session_id: sessionId,
      message_id: msg.id,
      rating,
      tag,
      user_query: prevUser?.content ?? '',
      assistant_reply: msg.content,
      stage: msg.stage ?? activeStage,
      intent: msg.intent ?? '',
      decision_trace: msg.decision_trace ?? {},
    });
    setMessages((prev) =>
      prev.map((m) => (m.id === msg.id ? {...m, rated: rating} : m)),
    );
  };

  // 路径 `/admin/*` 渲染商家管理后台，导航栏位于竖向右手边
  return (
    <div className="cs-admin-shell">
      <div className="cs-admin-main">
        {route.tab === 'chat' && (
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
              onRateMessage={(m, r, t) => void handleRateMessage(m, r, t)}
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
        )}

        {route.tab === 'attribution' && <AttributionView />}
        {route.tab === 'badcases' && <BadcaseView />}
        {route.tab === 'benchmark' && <BenchmarkView />}
      </div>

      {/* 后台竖向右手边导航栏 */}
      <nav className="cs-right-nav" aria-label="商家后台导航">
        <div>
          <div className="cs-right-nav-brand">
            <div style={{fontSize: 15, fontWeight: 700}}>MossAgent</div>
            <div style={{fontSize: 11, color: 'var(--cs-muted)', marginTop: 4}}>
              商家智能客服管理后台
            </div>
          </div>

          <VStack gap={2}>
            {ADMIN_NAV_ITEMS.map((item) => {
              const active = route.tab === item.tab;
              return (
                <button
                  key={item.tab}
                  type="button"
                  onClick={() => navigate(item.path)}
                  className={`cs-nav-item ${active ? 'cs-nav-item-active' : ''}`}>
                  <span>{item.title}</span>
                  <span className="cs-nav-sub">{item.desc}</span>
                </button>
              );
            })}
          </VStack>
        </div>

        <VStack gap={2}>
          <Button
            label="模型与红线配置"
            onClick={() => setShowSettings(true)}
          />
          <Button
            label="打开客户前台 (/chat)"
            onClick={() => navigate('/chat')}
          />
        </VStack>
      </nav>

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
