import {useEffect, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {HStack} from '@astryxdesign/core/HStack';
import {VStack} from '@astryxdesign/core/VStack';
import {api} from '../api/client';
import type {BadcaseItem} from '../types';

export function BadcaseView() {
  const [items, setItems] = useState<BadcaseItem[]>([]);
  const [proposals, setProposals] = useState<Record<number, string>>({});

  const load = async () => {
    const res = await api.getBadcases();
    setItems(res.badcases);
  };

  useEffect(() => {
    void load();
  }, []);

  const handleResolve = async (id: number, status: 'reviewed' | 'resolved') => {
    await api.updateBadcase(id, {
      status,
      fix_proposal: proposals[id] ?? '已更新 SOP 规则并通过回归测试',
    });
    await load();
  };

  return (
    <div style={{padding: 16, overflowY: 'auto', flex: 1}}>
      <div className="cs-panel">
        <div className="cs-panel-header">
          <span>Badcase 自进化闭环队列（点踩自动捕获 Decision Trace）</span>
          <Button label="刷新队列" onClick={() => void load()} />
        </div>
        <div className="cs-panel-body">
          {items.length === 0 ? (
            <div style={{fontSize: 13, color: 'var(--cs-muted)'}}>
              暂无待排查 Badcase。在「智能坐席」中对任意回复点击“👎 点踩进 Badcase 闭环”即可自动归档。
            </div>
          ) : (
            <VStack gap={3}>
              {items.map((bc) => (
                <div
                  key={bc.id}
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    border: '1px solid var(--cs-border)',
                    fontSize: 12,
                  }}>
                  <div style={{display: 'flex', justifyContent: 'space-between', fontWeight: 600}}>
                    <span>#{bc.id} · 标签：{bc.tag || '未分类'} · 阶段：{bc.stage}/{bc.intent}</span>
                    <span>状态：{bc.status}</span>
                  </div>
                  <div style={{marginTop: 6}}><strong>客户原问：</strong>{bc.user_query}</div>
                  <div style={{marginTop: 4, color: '#334155'}}><strong>助手回复：</strong>{bc.assistant_reply}</div>
                  <div style={{marginTop: 4, color: 'var(--cs-muted)'}}>
                    <strong>Decision Trace：</strong>
                    <code>{JSON.stringify(bc.decision_trace)}</code>
                  </div>
                  <div style={{marginTop: 8}}>
                    <input
                      type="text"
                      placeholder="填写靶向修复方案（如补充 SOP 规则 / 话术 / 回归用例）..."
                      value={proposals[bc.id] ?? bc.fix_proposal ?? ''}
                      onChange={(e) =>
                        setProposals((prev) => ({...prev, [bc.id]: e.target.value}))
                      }
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: '1px solid var(--cs-border)',
                        marginBottom: 8,
                      }}
                    />
                    <HStack gap={2}>
                      <Button
                        label="标记已复核"
                        onClick={() => void handleResolve(bc.id, 'reviewed')}
                      />
                      <Button
                        label="回归通过并关闭"
                        onClick={() => void handleResolve(bc.id, 'resolved')}
                      />
                    </HStack>
                  </div>
                </div>
              ))}
            </VStack>
          )}
        </div>
      </div>
    </div>
  );
}
