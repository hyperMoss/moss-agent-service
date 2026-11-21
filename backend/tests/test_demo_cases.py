"""Every supplied demo must reach its advertised SOP and emit a real decision trace."""
import asyncio
from app.agents.service_agent import CustomerServiceOrchestrator
from app.config import runtime_config
from app.demo import DEMO_CASES
from app.sop.router import route_intent
from app.store import CSStore


def test_all_demo_cases_use_real_pipeline(tmp_path, monkeypatch):
    monkeypatch.setattr(runtime_config, 'model_provider', 'demo')
    db = CSStore(db_path=str(tmp_path / 'demo.db'))
    agent = CustomerServiceOrchestrator(db)

    expected_intents = dict(zip(['custom', 'discount', 'shipping', 'logistics', 'change', 'quality'],
                                ['custom_order', 'page_size', 'urge_shipment', 'urge_logistics', 'change_product', 'quality_issue']))

    async def run():
        for case in DEMO_CASES:
            assert db.get_order(case['order_id'])
            assert route_intent(case['question']).stage == case['stage']
            events = [event async for event in agent.chat_stream(
                session_id=f"demo-test-{case['id']}", message=case['question'],
                order_id=case['order_id'], stage_hint=None)]
            final = next(e['data'] for e in events if e['event'] == 'done')
            assert final['stage'] == case['stage']
            assert final['intent'] == expected_intents[case['id']]
            assert final['reply']
            assert final['decision_trace']['service_node_id']
            assert final['tool_calls']
        assert db.list_after_sales_tickets()
        assert db.list_notifications()
    asyncio.run(run())
