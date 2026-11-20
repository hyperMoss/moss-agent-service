import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {HStack} from '@astryxdesign/core/HStack';
import {VStack} from '@astryxdesign/core/VStack';
import type {
  AfterSalesTicket,
  InvoiceRecord,
  WorkGroupNotification,
} from '../types';

interface RecordsPanelProps {
  tickets: AfterSalesTicket[];
  invoices: InvoiceRecord[];
  notifications: WorkGroupNotification[];
  onRefresh: () => void;
}

type TabKey = 'tickets' | 'notifications' | 'invoices';

const GROUP_LABEL: Record<string, string> = {
  factory_group: '工厂工作群',
  warehouse_group: '仓库工作群',
  courier_group: '快递工作群',
};

export function RecordsPanel({
  tickets,
  invoices,
  notifications,
  onRefresh,
}: RecordsPanelProps) {
  const [tab, setTab] = useState<TabKey>('tickets');

  return (
    <section className="cs-panel">
      <div className="cs-panel-header">
        <span>SOP 业务台账</span>
        <Button label="刷新" onClick={onRefresh} />
      </div>

      <div style={{padding: '10px 16px', borderBottom: '1px solid var(--cs-border)'}}>
        <HStack gap={2}>
          <Button
            label={`售后表 (${tickets.length})`}
            onClick={() => setTab('tickets')}
          />
          <Button
            label={`工作群 (${notifications.length})`}
            onClick={() => setTab('notifications')}
          />
          <Button
            label={`发票表 (${invoices.length})`}
            onClick={() => setTab('invoices')}
          />
        </HStack>
      </div>

      <div className="cs-panel-body">
        {tab === 'tickets' && (
          <VStack gap={2}>
            {tickets.length === 0 ? (
              <div style={{fontSize: 13, color: 'var(--cs-muted)'}}>
                暂无售后登记记录。触发品质/个人/物流售后对话后将自动登记。
              </div>
            ) : (
              <table className="cs-table">
                <thead>
                  <tr>
                    <th>订单号</th>
                    <th>分类/归属</th>
                    <th>挽单折扣</th>
                    <th>结果</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map((t) => (
                    <tr key={t.id}>
                      <td>{t.order_id}</td>
                      <td>
                        <div>{t.category} / {t.source_party}</div>
                        <div style={{color: 'var(--cs-muted)'}}>{t.sub_reason}</div>
                      </td>
                      <td>
                        {t.discount_offered
                          ? `${(t.discount_offered * 10).toFixed(1)}折`
                          : '-'}
                      </td>
                      <td>{t.resolution}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </VStack>
        )}

        {tab === 'notifications' && (
          <VStack gap={2}>
            {notifications.length === 0 ? (
              <div style={{fontSize: 13, color: 'var(--cs-muted)'}}>
                暂无工作群流转通知。催发货/催物流/改地址/品质反馈会自动推送至此。
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    border: '1px solid var(--cs-border)',
                    fontSize: 12,
                  }}>
                  <div style={{fontWeight: 600, marginBottom: 4}}>
                    {GROUP_LABEL[n.group_type] ?? n.group_type} · {n.order_id}
                  </div>
                  <div style={{color: '#374151'}}>{n.summary}</div>
                  <div style={{color: 'var(--cs-muted)', marginTop: 4}}>
                    {n.created_at}
                  </div>
                </div>
              ))
            )}
          </VStack>
        )}

        {tab === 'invoices' && (
          <VStack gap={2}>
            {invoices.length === 0 ? (
              <div style={{fontSize: 13, color: 'var(--cs-muted)'}}>
                暂无线下开票登记记录。
              </div>
            ) : (
              <table className="cs-table">
                <thead>
                  <tr>
                    <th>订单号</th>
                    <th>抬头</th>
                    <th>金额</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td>{inv.order_id}</td>
                      <td>{inv.buyer_title}</td>
                      <td>¥{inv.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </VStack>
        )}
      </div>
    </section>
  );
}
