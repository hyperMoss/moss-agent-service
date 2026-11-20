import {Button} from '@astryxdesign/core/Button';
import {VStack} from '@astryxdesign/core/VStack';
import {HStack} from '@astryxdesign/core/HStack';
import type {ScriptItem, SopTree, StageType} from '../types';

interface SopNavigatorProps {
  sop: SopTree | null;
  scripts: ScriptItem[];
  activeStage: StageType;
  onStageChange: (stage: StageType) => void;
  onQuickPrompt: (text: string) => void;
}

const STAGE_LABELS: Record<StageType, string> = {
  presales: '售前',
  insales: '售中',
  aftersales: '售后',
};

const QUICK_SCENARIOS: Array<{label: string; stage: StageType; prompt: string}> = [
  {
    label: '定制报价+LOGO',
    stage: 'presales',
    prompt: '我想定制一块 200x300 带LOGO的铝合金商用门垫，异形裁剪多少钱？几天发货？',
  },
  {
    label: '页面尺寸砍价',
    stage: 'presales',
    prompt: '页面尺寸的丝圈地垫能给9.5折吗？',
  },
  {
    label: '物流停滞>48h',
    stage: 'insales',
    prompt: '订单 DD20261116003 物流停滞好几天不动了，帮我查一下！',
  },
  {
    label: '发货后定制改品',
    stage: 'insales',
    prompt: '订单 DD20261114004 能帮我改一下颜色和尺寸吗？',
  },
  {
    label: '品质问题7折挽单',
    stage: 'aftersales',
    prompt: '订单 DD20261114004 收到的地垫边缘有脱胶质量问题，怎么办？',
  },
  {
    label: '色差气味8折挽单',
    stage: 'aftersales',
    prompt: '收到的地垫有点色差而且有味道，尺寸好像差了2cm，想退货',
  },
];

export function SopNavigator({
  sop,
  scripts,
  activeStage,
  onStageChange,
  onQuickPrompt,
}: SopNavigatorProps) {
  const stageData = sop?.[activeStage];
  const stageScripts = scripts.filter((s) => s.stage === activeStage);

  return (
    <aside className="cs-panel">
      <div className="cs-panel-header">
        <span>SOP 接待流程与话术</span>
      </div>
      <div className="cs-panel-body">
        <VStack gap={3}>
          <HStack gap={2}>
            {(['presales', 'insales', 'aftersales'] as StageType[]).map((st) => (
              <Button
                key={st}
                label={STAGE_LABELS[st]}
                onClick={() => onStageChange(st)}
              />
            ))}
          </HStack>

          <div>
            <div style={{fontSize: 12, color: 'var(--cs-muted)', marginBottom: 6}}>
              一键模拟典型客户场景
            </div>
            <VStack gap={2}>
              {QUICK_SCENARIOS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    onStageChange(item.stage);
                    onQuickPrompt(item.prompt);
                  }}
                  style={{
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--cs-border)',
                    background: '#fafafa',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}>
                  <strong>[{STAGE_LABELS[item.stage]}] {item.label}</strong>
                  <div style={{color: 'var(--cs-muted)', marginTop: 2}}>
                    {item.prompt}
                  </div>
                </button>
              ))}
            </VStack>
          </div>

          {stageData && (
            <div>
              <div style={{fontSize: 12, color: 'var(--cs-muted)', marginBottom: 6}}>
                {stageData.title} · SOP 核心节点
              </div>
              <VStack gap={2}>
                {stageData.branches.map((branch) => (
                  <div
                    key={branch.id}
                    style={{
                      padding: 10,
                      borderRadius: 8,
                      border: '1px solid var(--cs-border)',
                      background: '#ffffff',
                    }}>
                    <div style={{fontWeight: 600, fontSize: 13}}>{branch.name}</div>
                    <div style={{fontSize: 12, color: 'var(--cs-muted)', marginTop: 4}}>
                      {branch.summary}
                    </div>
                  </div>
                ))}
              </VStack>
            </div>
          )}

          <div>
            <div style={{fontSize: 12, color: 'var(--cs-muted)', marginBottom: 6}}>
              高频话术库（点击复制到输入框）
            </div>
            <VStack gap={2}>
              {stageScripts.map((script) => (
                <div
                  key={script.id}
                  onClick={() => onQuickPrompt(script.content)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onQuickPrompt(script.content);
                  }}
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    border: '1px solid #dbeafe',
                    background: 'var(--cs-primary-soft)',
                    cursor: 'pointer',
                    fontSize: 12,
                  }}>
                  <div style={{fontWeight: 600, marginBottom: 4}}>
                    [{script.tag}] {script.title}
                  </div>
                  <div style={{color: '#334155', whiteSpace: 'pre-wrap'}}>
                    {script.content}
                  </div>
                </div>
              ))}
            </VStack>
          </div>
        </VStack>
      </div>
    </aside>
  );
}
