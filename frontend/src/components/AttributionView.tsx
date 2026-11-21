import {useEffect, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {HStack} from '@astryxdesign/core/HStack';
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
  const [asking, setAsking] = useState(false);

  // 右侧「原文与归因依据」下钻抽屉状态
  const [drawerRows, setDrawerRows] = useState<number[]>([]);
  const [drawerRule, setDrawerRule] = useState<AttributionRuleMeta | null>(null);
  const [drawerTitle, setDrawerTitle] = useState<string>('');

  const loadBoard = async () => {
    const data = await api.getAttributionDashboard();
    setBoard(data);
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
    } finally {
      setAsking(false);
    }
  };

  if (!board) {
    return <div style={{padding: 24, color: 'var(--cs-muted)'}}>正在加载经营归因看板...</div>;
  }

  return (
    <div style={{padding: 16, overflowY: 'auto', flex: 1}}>
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
            {board.guardrail_notice}（当前样本：快照 {board.snapshot_count} 条 + 实时售后表 {board.live_count} 条 = 共 {board.total_tickets} 条）
          </div>
          <Button label="刷新口径" onClick={() => void loadBoard()} />
        </div>

        {/* Onto 双页签切换 */}
        <HStack gap={2}>
          <Button
            label={subTab === 'overview' ? '● 售后问题分布' : '售后问题分布'}
            onClick={() => setSubTab('overview')}
          />
          <Button
            label={subTab === 'attribution' ? '● 归因与决策' : '归因与决策'}
            onClick={() => setSubTab('attribution')}
          />
        </HStack>

        {subTab === 'overview' && (
          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14}}>
            {/* 产品问题工单排名 */}
            <div className="cs-panel">
              <div className="cs-panel-header">
                <span>产品问题工单 · 排名（仅用于抽查）</span>
              </div>
              <div className="cs-panel-body">
                <table className="cs-table">
                  <thead>
                    <tr>
                      <th>产品型号 / SKU</th>
                      <th>工单数</th>
                      <th>原文溯源</th>
                    </tr>
                  </thead>
                  <tbody>
                    {board.sku_ranking.map((item) => (
                      <tr key={item.sku_name}>
                        <td>{item.sku_name}</td>
                        <td><strong>{item.count}</strong></td>
                        <td>
                          <div style={{display: 'flex', gap: 4, flexWrap: 'wrap'}}>
                            {item.row_numbers.map((rn) => (
                              <button
                                key={rn}
                                type="button"
                                onClick={() => openDrawer(`产品抽查 · ${item.sku_name}`, [rn])}
                                style={{
                                  fontSize: 11,
                                  padding: '2px 6px',
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
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 明确问题码排名 */}
            <div className="cs-panel">
              <div className="cs-panel-header">
                <span>明确问题码 · 排名（同工单同码计一次）</span>
              </div>
              <div className="cs-panel-body">
                <table className="cs-table">
                  <thead>
                    <tr>
                      <th>问题码</th>
                      <th>命中数</th>
                      <th>对应工单行</th>
                    </tr>
                  </thead>
                  <tbody>
                    {board.issue_code_ranking.map((item) => (
                      <tr key={item.issue_code}>
                        <td><code>{item.issue_code}</code></td>
                        <td><strong>{item.count}</strong></td>
                        <td>
                          <div style={{display: 'flex', gap: 4, flexWrap: 'wrap'}}>
                            {item.row_numbers.map((rn) => (
                              <button
                                key={rn}
                                type="button"
                                onClick={() => openDrawer(`问题码溯源 · ${item.issue_code}`, [rn])}
                                style={{
                                  fontSize: 11,
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  border: '1px solid #cbd5e1',
                                  background: '#f8fafc',
                                  cursor: 'pointer',
                                }}>
                                工单第{rn}行
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

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
          <div style={{display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: 14}}>
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
            width: 440,
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
