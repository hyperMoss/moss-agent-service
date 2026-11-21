import {useState} from 'react';
import type {ChatMessage} from '../types';

type Node = {id: string; type: string; label: string; description: string; sources: {id: string; turn: number; text: string}[]};
const COLORS: Record<string, string> = {Order: '#0d9488', Product: '#6366f1', KnowledgeItem: '#d58a22', Policy: '#c75b83'};

/** Only project observed tool results and decision traces, never infer an order from a selection. */
export function projectConversation(messages: ChatMessage[]): Node[] {
  const nodes = new Map<string, Node>();
  let turn = 0;
  let question: ChatMessage | undefined;
  for (const message of messages) {
    if (message.role === 'user') { turn++; question = message; continue; }
    if (!question) continue;
    const source = {id: question.id, turn, text: question.content};
    const add = (id: string, type: string, label: string, description: string) => {
      const key = `${type}:${id}`;
      const node = nodes.get(key) ?? {id: key, type, label, description, sources: []};
      if (!node.sources.some(s => s.id === source.id)) node.sources.push(source);
      nodes.set(key, node);
    };
    for (const tool of message.tool_calls ?? []) {
      const order = tool.result.order as Record<string, unknown> | undefined;
      if (tool.result.found === true && order && typeof order.order_id === 'string') {
        add(order.order_id, 'Order', order.order_id, '本轮工具已查询到的订单资料快照');
        if (typeof order.product_name === 'string') add(order.product_name, 'Product', order.product_name, '订单中的产品信息');
      }
      if (tool.tool_name === 'quote_custom_mat' && typeof tool.result.material === 'string') {
        add(tool.result.material, 'Product', tool.result.material, `定制报价规格：${tool.result.size_cm ?? '待确认'}`);
      }
    }
    if (message.decision_trace) {
      const trace = message.decision_trace;
      add(trace.service_node_id, 'KnowledgeItem', trace.service_node_id, `服务场景：${message.intent ?? ''}`);
      add(trace.decision_rule_id, 'Policy', trace.decision_rule_id,
        `允许：${trace.allowed_actions.join('；')}\n禁止：${trace.blocked_actions.join('；')}`);
    }
  }
  return [...nodes.values()];
}

export function ServiceOntology({messages}: {messages: ChatMessage[]}) {
  const [selected, setSelected] = useState('');
  const nodes = projectConversation(messages);
  const node = nodes.find(n => n.id === selected);
  const height = Math.max(220, Math.ceil(nodes.length / 2) * 130);
  const point = (i: number) => ({x: i % 2 ? 252 : 88, y: 60 + Math.floor(i / 2) * 130});
  const edges = nodes.flatMap((n, i) => nodes.slice(i + 1).flatMap((other, j) =>
    n.sources.some(s => other.sources.some(t => t.id === s.id)) ? [{a: i, b: i + j + 1}] : []));
  return <aside className="oc-ontology" aria-label="Service Ontology 对话本体">
    <header><small>Service Ontology</small><h2>对话本体 <b>{nodes.length}</b></h2><p>只展示当前对话关联的信息</p></header>
    {nodes.length === 0 ? <section className="oc-graph-empty">开始对话后，订单、产品、知识与规则将出现在这里。</section> :
      <section className="oc-graph" style={{height}}>
        <svg viewBox={`0 0 340 ${height}`} preserveAspectRatio="none" aria-hidden="true">
          {edges.map(({a,b}) => <line key={`${a}-${b}`} x1={point(a).x} y1={point(a).y} x2={point(b).x} y2={point(b).y} />)}
        </svg>
        {nodes.map((n, i) => <button key={n.id} type="button" className="oc-node" aria-pressed={selected === n.id}
          style={{left: `${point(i).x / 3.4}%`, top: point(i).y, borderColor: COLORS[n.type]}}
          onClick={() => setSelected(n.id)}><small style={{color: COLORS[n.type]}}>{n.type}</small><strong>{n.label}</strong></button>)}
      </section>}
    <footer className="oc-legend">{Object.entries(COLORS).map(([type,color]) => <small key={type} style={{color}}>● {type}</small>)}</footer>
    {node && <section className="oc-node-detail"><strong>{node.label}</strong><p>{node.description}</p>
      {node.sources.map(source => <button type="button" key={source.id} onClick={() => {
        const target = document.getElementById(source.id);
        target?.scrollIntoView({behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center'});
        target?.focus({preventScroll: true});
      }}>第 {source.turn} 轮 · {source.text}</button>)}
    </section>}
    <p className="oc-graph-note">连线表示信息参与了同一轮对话。点击节点，定位关联提问。</p>
  </aside>;
}
