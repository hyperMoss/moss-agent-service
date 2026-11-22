import {useEffect, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {api, streamChat} from '../api/client';
import {ServiceOntology} from './ServiceOntology';
import type {ChatMessage, DemoCase} from '../types';

const STAGES = {presales: '售前', insales: '售中', aftersales: '售后'};
export function DemoTicketsView() {
  const [cases, setCases] = useState<DemoCase[]>([]);
  const [selected, setSelected] = useState('');
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [runtimeProvider, setRuntimeProvider] = useState('');
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState(() => `demo-${crypto.randomUUID()}`);
  const active = cases.find(c => c.id === selected);
  const load = () => {setError(''); api.getDemoCases().then(r => {setCases(r.cases);}).catch(() => setError('演示工单加载失败，请确认后端服务后重试。'));};
  useEffect(load, []);
  const choose = (item: DemoCase) => {
    setSelected(item.id); setMessages([]); setRuntimeProvider(''); setInput(item.question); setError('');
    setSession(`demo-${crypto.randomUUID()}`);
  };
  const send = async () => {
    if (!active || loading || !input.trim()) return;
    const text = input.trim(), id = crypto.randomUUID();
    setMessages(prev => [...prev, {id: `u-${id}`, role: 'user', content: text}, {id, role: 'assistant', content: ''}]);
    setInput(''); setLoading(true); setError('');
    const update = (fn: (m: ChatMessage) => ChatMessage) => setMessages(prev => prev.map(m => m.id === id ? fn(m) : m));
    try {
      await streamChat({session_id: session, message: text, order_id: active.order_id, stage_hint: null}, {
        onMeta: meta => {setRuntimeProvider(meta.provider); update(m => ({...m, stage: meta.stage, intent: meta.intent}));},
        onToolCall: trace => update(m => ({...m, tool_calls: [...(m.tool_calls ?? []), trace]})),
        onDecisionTrace: trace => update(m => ({...m, decision_trace: trace})),
        onDelta: delta => update(m => ({...m, content: m.content + delta})),
      });
    } catch { setError('运行失败，请确认后端服务后重新发送。'); setInput(text); }
    finally {setLoading(false);}
  };
  return <main className="oc-page">
    <header className="oc-heading"><section><h1>演示工单</h1><p>选择典型服务场景，查看客服回复与对话信息关联</p></section><small>演示运行会登记售后表或工作群通知</small></header>
    {error && <p role="alert">{error} <button onClick={load}>重新加载工单</button></p>}
    <section className="oc-demo-grid">
      <aside className="oc-case-list"><label>搜索演示工单<input value={filter} onChange={e => setFilter(e.target.value)} placeholder="场景、订单号或问题" /></label>
        {cases.filter(c => `${c.title} ${c.order_id} ${c.question}`.includes(filter)).map(c => <button disabled={loading} type="button" key={c.id} aria-pressed={selected === c.id} onClick={() => choose(c)}>
          <small>{STAGES[c.stage]} · {c.order_id}</small><strong>{c.title}</strong><p>{c.question}</p>
        </button>)}
        {cases.length > 0 && !cases.some(c => `${c.title} ${c.order_id} ${c.question}`.includes(filter)) && <p>没有匹配的工单，请调整搜索词。</p>}
      </aside>
      <section className="oc-demo-chat">
        {active ? <><header><h2>{active.title}</h2><p>{active.order_id} · {STAGES[active.stage]}场景{runtimeProvider && ` · 本次引擎：${runtimeProvider}`}</p><details><summary>查看预期流程</summary>{active.expected}<p>实际结果以本次运行轨迹为准。</p></details></header>
          <section className="oc-demo-messages" aria-live="polite">{messages.length === 0 && <p className="oc-empty">问题已填入下方，点击「运行演示」开始。</p>}
            {messages.map(m => <article id={m.id} tabIndex={-1} key={m.id} className={`cs-bubble cs-bubble-${m.role}`}>
              {m.content || '正在处理…'}
              {!!m.tool_calls?.length && <details><summary>工具轨迹 · {m.tool_calls.length}</summary>{m.tool_calls.map((t,i) => <pre key={i}>{t.tool_name}{'\n'}{JSON.stringify(t.result, null, 2)}</pre>)}</details>}
              {m.decision_trace && <details><summary>决策依据 · {m.decision_trace.guardrail_passed ? '校验通过' : '触发拦截'}</summary><p>{m.decision_trace.service_node_id} / {m.decision_trace.decision_rule_id}</p><p>允许：{m.decision_trace.allowed_actions.join('；')}</p><p>禁止：{m.decision_trace.blocked_actions.join('；')}</p></details>}
            </article>)}
          </section>
          <section className="cs-composer"><textarea aria-label="演示问题" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => {if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {e.preventDefault(); void send();}}} />
            <Button label={loading ? '运行中…' : messages.length ? '发送追问' : '运行演示'} isDisabled={loading || !input.trim()} onClick={() => void send()} />
            <Button label="重置会话" isDisabled={loading} onClick={() => choose(active)} />
          </section></> : <p className="oc-empty">选择左侧工单，开始演示。</p>}
      </section>
      <ServiceOntology messages={messages} />
    </section>
  </main>;
}
