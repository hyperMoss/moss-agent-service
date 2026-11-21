import {useEffect, useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {VStack} from '@astryxdesign/core/VStack';
import {api} from '../api/client';
import type {BenchmarkRunResult, DatasetCatalogItem} from '../types';

export function BenchmarkView() {
  const [catalog, setCatalog] = useState<DatasetCatalogItem[]>([]);
  const [result, setResult] = useState<BenchmarkRunResult | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await api.getBenchmarkCatalog();
      setCatalog(res.catalog);
    })();
  }, []);

  const handleRun = async () => {
    setRunning(true);
    try {
      const res = await api.runBenchmark();
      setResult(res);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{padding: 16, overflowY: 'auto', flex: 1}}>
      <VStack gap={3}>
        <div className="cs-panel">
          <div className="cs-panel-header">
            <span>公开测试数据集与回归评测中心</span>
            <Button
              label={running ? '回归评测运行中...' : '一键运行 20 条 SOP 全链路回归测试'}
              onClick={() => void handleRun()}
            />
          </div>
          <div className="cs-panel-body">
            <table className="cs-table">
              <thead>
                <tr>
                  <th>数据集名称</th>
                  <th>语言</th>
                  <th>样本量</th>
                  <th>说明与来源</th>
                </tr>
              </thead>
              <tbody>
                {catalog.map((ds) => (
                  <tr key={ds.id}>
                    <td><strong>{ds.name}</strong></td>
                    <td>{ds.language}</td>
                    <td>{ds.size}</td>
                    <td>
                      <div>{ds.description}</div>
                      <div style={{color: 'var(--cs-primary)', marginTop: 2}}>
                        {ds.source_url}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {result && (
          <div className="cs-panel">
            <div className="cs-panel-header">
              <span>
                最新回归结果（共 {result.total_cases} 条）：阶段准确率 {result.stage_accuracy}% ｜
                意图准确率 {result.intent_accuracy}% ｜ 关键约束命中 {result.keyword_pass_rate}% ｜
                双本体护栏通过率 {result.guardrail_pass_rate}%
              </span>
            </div>
            <div className="cs-panel-body">
              <table className="cs-table">
                <thead>
                  <tr>
                    <th>用例</th>
                    <th>场景</th>
                    <th>输入</th>
                    <th>路由/意图</th>
                    <th>护栏与约束</th>
                    <th>耗时</th>
                  </tr>
                </thead>
                <tbody>
                  {result.cases.map((c) => (
                    <tr key={c.id}>
                      <td><code>{c.id}</code></td>
                      <td>{c.category}</td>
                      <td>{c.query}</td>
                      <td>
                        {c.actual_stage}/{c.actual_intent}{' '}
                        {c.stage_ok && c.intent_ok ? '✅' : '❌'}
                      </td>
                      <td>
                        {c.decision_rule_id} · {c.guardrail_ok && c.keyword_ok ? '✅ 通过' : '⚠️ 需复核'}
                      </td>
                      <td>{c.latency_ms}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </VStack>
    </div>
  );
}
