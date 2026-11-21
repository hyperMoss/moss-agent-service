import {useEffect, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {HStack} from '@astryxdesign/core/HStack';
import {TabList, Tab} from '@astryxdesign/core/TabList';
import {VStack} from '@astryxdesign/core/VStack';
import {api} from '../api/client';
import type {
  AttributionAnswer,
  AttributionDashboard,
  AttributionRuleMeta,
} from '../types';

/**
 * 严格对标 Onto (analytics.html + merchant-attribution-agent.js) 的经营归因与决策页面：
 * 1. 双页签：「售后问题分布」与「归因与决策」
 * 2. 只读统计护栏声明（不执行业务动作、工单量不代表故障率/退货率）
 * 3. 交互式「经营归因助手」含“猜你想问”预设问题
 * 4. 点击任意「工单第N行」滑出右侧「原文与归因依据」抽屉（展示工单原文、规则定义、知识覆盖与订单快照）
 */
export function AttributionView() {
  const [board, setBoard] = useState<AttributionDashboard | null>(null);
  const [subTab, setSubTab] = useState<'overview' | 'attribution'>('overview');
  const [question, setQuestion] = useState('');
  const [qaHistory, setQaHistory] = useState<AttributionAnswer[]>([]);
  const [error, setError] = useState('');
  const [asking, setAsking] = useState(false);

  // 右侧「原文与归因依据」下钻抽屉状态
  const [drawerRows, setDrawerRows] = useState<number[]>([]);
  const [drawerRule, setDrawerRule] = useState<AttributionRuleMeta | null>(null);
  const [drawerTitle, setDrawerTitle] = useState<string>('');

  const loadBoard = async () => {
    setError('');
    try { setBoard(await api.getAttributionDashboard()); }
    catch { setError('看板加载失败，请确认后端服务后重试。'); }
  };

  useEffect(() => {
    void loadBoard();
  }, []);

  const openDrawer = (title: string, rows: number[], rule: AttributionRuleMeta | null = null) => {
    setDrawerTitle(title);
    setDrawerRows(rows);
    setDrawerRule(rule);
  };

  const handleAsk = async (qText: string) => {
    const q = qText.trim();
    if (!q || asking) return;
    setAsking(true);
    try {
      const ans = await api.askAttribution(q);
      setQaHistory((prev) => [ans, ...prev]);
      setQuestion('');
    } catch { setError('归因问答失败，请稍后重试。'); } finally {
      setAsking(false);
    }
  };

  if (!board) {
    return <section className="oc-page"><p role="status">{error || '正在加载经营归因看板…'}</p>{error && <Button label="重试" onClick={() => void loadBoard()} />}</section>;
  }

  return (
    <div className="oc-dashboard" style={{padding: 16, overflowY: 'auto', flex: 1}}>
      <header className="oc-heading"><section><h1>经营看板</h1><p>全量工单快照 · 观察问题分布，追溯原文与归因依据</p></section></header>
      {error && <p role="alert">{error}</p>}
      <VStack gap={3}>
        {/* 只读归因护栏声明条 */}
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            fontSize: 12,
            color: '#1e3a8a',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}>
          <div>
            <strong>只读归因引擎护栏：</strong>
            {board.guardrail_notice}（快照 {board.snapshot_count} 条 + 实时 {board.live_count} 条，共 {board.total_tickets} 条）
          </div>
          <section style={{flexShrink: 0}}><Button label="刷新口径" onClick={() => void loadBoard()} /></section>
        </div>

        <TabList role="tablist" value={subTab} onChange={value => setSubTab(value as 'overview' | 'attribution')}>
          <Tab value="overview" label="可视化看板" panelId="oc-overview" />
          <Tab value="attribution" label="归因与决策" panelId="oc-attribution" />
        </TabList>

        {subTab === 'overview' && (
          <div id="oc-overview" role="tabpanel" style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18}}>
            <section className="oc-chart-card">
              <h2>产品问题工单</h2><p>按工单数排序，点击查看对应原文</p>
              {board.sku_ranking.map(item => <button className="oc-bar" type="button" key={item.sku_name} onClick={() => openDrawer(`产品抽查 · ${item.sku_name}`, item.row_numbers)}>
                <strong>{item.sku_name}</strong><meter min={0} max={Math.max(...board.sku_ranking.map(r => r.count), 1)} value={item.count} aria-label={`${item.sku_name}工单数`} /><small>{item.count} 条 · 查看原文</small>
              </button>)}
              <p className="oc-chart-note">工单量仅用于抽查优先级，不代表故障率。</p>
            </section>
            <section className="oc-chart-card">
              <h2>明确问题码</h2><p>同一工单的相同问题码只计一次</p>
              {board.issue_code_ranking.map(item => <button className="oc-bar" type="button" key={item.issue_code} onClick={() => openDrawer(`问题码溯源 · ${item.issue_code}`, item.row_numbers)}>
                <strong>{item.issue_code}</strong><meter min={0} max={Math.max(...board.issue_code_ranking.map(r => r.count), 1)} value={item.count} aria-label={`${item.issue_code}工单数`} /><small>{item.count} 条 · 查看原文</small>
              </button>)}
              <p className="oc-chart-note">每项统计均绑定本次快照与实时售后表中的工单行号。</p>
            </section>
            <section className="oc-chart-card" style={{gridColumn: '1 / -1'}}>
              <h2>售后场景分布</h2>
              {board.category_distribution.map(item => <button className="oc-bar" type="button" key={item.category} onClick={() => openDrawer(`售后场景 · ${item.category}`, Object.values(board.rows_by_number).filter(r => r.category === item.category).map(r => r.row_no))}>
                <strong>{{quality:'品质问题',personal:'个人原因',logistics:'物流问题'}[item.category] ?? item.category}</strong><meter min={0} max={Math.max(board.total_tickets, 1)} value={item.count} /><small>{item.count} 条 · 查看原文</small>
              </button>)}
            </section>

            {/* 需要优先核查的情绪线索 */}
            <div className="cs-panel" style={{gridColumn: '1 / -1'}}>
              <div className="cs-panel-header">
                <span>需要优先核查的情绪线索（仅按明确词组筛选，不改变退换/折扣资格）</span>
              </div>
              <div className="cs-panel-body">
                <table className="cs-table">
                  <thead>
                    <tr>
                      <th>溯源行</th>
                      <th>订单号</th>
                      <th>命中情绪词</th>
                      <th>客诉原文摘录</th>
                    </tr>
                  </thead>
                  <tbody>
                    {board.emotion_leads.map((lead) => (
                      <tr key={lead.row_no}>
                        <td>
                          <button
                            type="button"
                            onClick={() => openDrawer('情绪风险核查', [lead.row_no])}
                            style={{
                              fontSize: 11,
                              padding: '2px 6px',
                              borderRadius: 4,
                              border: '1px solid #fca5a5',
                              background: '#fef2f2',
                              color: '#b91c1c',
                              cursor: 'pointer',
                            }}>
                            工单第{lead.row_no}行
                          </button>
                        </td>
                        <td>{lead.order_id}</td>
                        <td>{lead.matched_words.join(' / ')}</td>
                        <td>{lead.original_text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {subTab === 'attribution' && (
          <div id="oc-attribution" role="tabpanel" style={{display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: 18}}>
            {/* 左侧：四大根因候选 + 运营核查规则卡片 */}
            <div className="cs-panel">
              <div className="cs-panel-header">
                <span>根因候选与运营核查规则 · 查看证据与决策依据</span>
              </div>
              <div className="cs-panel-body">
                <VStack gap={3}>
                  {board.rule_cards.map((card) => (
                    <div
                      key={card.rule.code}
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        border: '1px solid var(--cs-border)',
                        background: '#ffffff',
                      }}>
                      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                        <strong>{card.rule.code} · {card.rule.name}</strong>
                        <span style={{fontSize: 12, color: 'var(--cs-primary)', fontWeight: 600}}>
                          命中 {card.count} 条
                        </span>
                      </div>
                      <div style={{fontSize: 12, color: 'var(--cs-muted)', marginTop: 4}}>
                        <strong>规则定义：</strong>{card.rule.definition}
                      </div>
                      <div style={{fontSize: 12, color: '#065f46', marginTop: 4}}>
                        <strong>核查建议：</strong>{card.rule.advice}
                      </div>
                      <div style={{display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8}}>
                        {card.row_numbers.map((rn) => (
                          <button
                            key={rn}
                            type="button"
                            onClick={() => openDrawer(`${card.rule.code} 归因依据`, [rn], card.rule)}
                            style={{
                              fontSize: 11,
                              padding: '2px 8px',
                              borderRadius: 4,
                              border: '1px solid #93c5fd',
                              background: '#eff6ff',
                              color: '#1d4ed8',
                              cursor: 'pointer',
                            }}>
                            工单第{rn}行
                          </button>
                        ))}
                        {card.row_numbers.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              openDrawer(`${card.rule.code} 全部命中工单`, card.row_numbers, card.rule)
                            }
                            style={{
                              fontSize: 11,
                              padding: '2px 8px',
                              borderRadius: 4,
                              border: '1px solid var(--cs-border)',
                              background: '#f9fafb',
                              cursor: 'pointer',
                            }}>
                            查看全部 ({card.row_numbers.length})
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </VStack>
              </div>
            </div>

            {/* 右侧：交互式经营归因助手 */}
            <div className="cs-panel">
              <div className="cs-panel-header">
                <span>经营归因助手（只读证据链问答）</span>
              </div>
              <div className="cs-panel-body">
                <VStack gap={3}>
                  <div>
                    <div style={{fontSize: 12, color: 'var(--cs-muted)', marginBottom: 6}}>
                      猜你想问（点击立即提问）：
                    </div>
                    <VStack gap={1}>
                      {board.suggested_questions.map((sq) => (
                        <button
                          key={sq}
                          type="button"
                          onClick={() => void handleAsk(sq)}
                          style={{
                            textAlign: 'left',
                            fontSize: 12,
                            padding: '6px 10px',
                            borderRadius: 8,
                            border: '1px solid var(--cs-border)',
                            background: '#f9fafb',
                            cursor: 'pointer',
                          }}>
                          {sq}
                        </button>
                      ))}
                    </VStack>
                  </div>

                  <HStack gap={2}>
                    <input
                      type="text"
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder="输入经营归因问题..."
                      style={{
                        flex: 1,
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid var(--cs-border)',
                        fontSize: 13,
                      }}
                    />
                    <Button
                      label={asking ? '分析中...' : '提问'}
                      onClick={() => void handleAsk(question)}
                    />
                  </HStack>

                  <VStack gap={2}>
                    {qaHistory.map((item, idx) => (
                      <div
                        key={idx}
                        style={{
                          padding: 12,
                          borderRadius: 10,
                          background: '#f8fafc',
                          border: '1px solid var(--cs-border)',
                          fontSize: 12,
                        }}>
                        <div style={{fontWeight: 600}}>问：{item.question}</div>
                        <div style={{marginTop: 6, lineHeight: 1.55}}>{item.answer}</div>
                        <div style={{marginTop: 6, color: 'var(--cs-muted)'}}>
                          依据规则：<code>{item.rule.code}</code>（{item.rule.name}）
                        </div>
                        <div style={{display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6}}>
                          {item.cited_rows.map((rn) => (
                            <button
                              key={rn}
                              type="button"
                              onClick={() => openDrawer(`归因助手溯源 · ${item.rule.code}`, [rn], item.rule)}
                              style={{
                                fontSize: 11,
                                padding: '2px 8px',
                                borderRadius: 4,
                                border: '1px solid #93c5fd',
                                background: '#eff6ff',
                                color: '#1d4ed8',
                                cursor: 'pointer',
                              }}>
                              工单第{rn}行
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </VStack>
                </VStack>
              </div>
            </div>
          </div>
        )}
      </VStack>

      {/* Onto 风格右侧可下钻「原文与归因依据」抽屉 */}
      {drawerRows.length > 0 && (
        <aside
          aria-label="原文与归因依据"
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: 'min(440px, 100vw)',
            background: '#ffffff',
            borderLeft: '1px solid var(--cs-border)',
            boxShadow: '-12px 0 32px rgba(15, 23, 42, 0.14)',
            zIndex: 60,
            display: 'flex',
            flexDirection: 'column',
          }}>
          <div className="cs-panel-header">
            <span>原文与归因依据 · {drawerTitle}</span>
            <Button label="关闭" onClick={() => setDrawerRows([])} />
          </div>
          <div className="cs-panel-body">
            <VStack gap={3}>
              {drawerRule && (
                <div
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    background: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    fontSize: 12,
                  }}>
                  <div style={{fontWeight: 700}}>
                    {drawerRule.code} · {drawerRule.name}
                  </div>
                  <div style={{marginTop: 4}}>{drawerRule.definition}</div>
                  <div style={{marginTop: 4, color: '#065f46'}}>
                    <strong>行动建议：</strong>{drawerRule.advice}
                  </div>
                </div>
              )}

              {drawerRows.map((rn) => {
                const row = board.rows_by_number[String(rn)];
                if (!row) return null;
                return (
                  <div
                    key={rn}
                    style={{
                      padding: 12,
                      borderRadius: 10,
                      border: '1px solid var(--cs-border)',
                      fontSize: 12,
                    }}>
                    <div style={{fontWeight: 700, marginBottom: 4}}>
                      客诉工单信息表第 {row.row_no} 行 · {row.order_id}
                    </div>
                    <div><strong>产品：</strong>{row.sku_name}</div>
                    <div><strong>归属/问题码：</strong>{row.source_party} / <code>{row.issue_code}</code></div>
                    <div style={{marginTop: 6, padding: 8, borderRadius: 6, background: '#f8fafc'}}>
                      <strong>工单原文：</strong>{row.original_text}
                    </div>
                    <div style={{marginTop: 6}}>
                      <strong>知识覆盖情况：</strong>{row.knowledge_coverage}
                    </div>
                    <div style={{marginTop: 4}}>
                      <strong>订单快照：</strong>
                      <code>{JSON.stringify(row.order_snapshot)}</code>
                    </div>
                  </div>
                );
              })}
            </VStack>
          </div>
        </aside>
      )}
    </div>
  );
}
