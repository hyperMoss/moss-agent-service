"""Exercise the installed AgentScope toolkit and its real stream event contract."""
import asyncio
import json
from types import SimpleNamespace

from agentscope.event import ToolCallStartEvent, ToolCallDeltaEvent, ToolResultTextDeltaEvent, ToolResultEndEvent, TextBlockDeltaEvent
from app.agents.service_agent import CustomerServiceOrchestrator
from app.config import runtime_config
from app.store import CSStore


def test_configured_model_toolkit_and_stream(tmp_path, monkeypatch):
    monkeypatch.setattr(runtime_config, 'model_provider', 'openai')
    monkeypatch.setattr(runtime_config, 'openai_api_key', 'test-only-placeholder')
    service = CustomerServiceOrchestrator(CSStore(str(tmp_path / 'model.db')))
    agent = service._create_agentscope_agent('test')

    async def reply_stream(_):
        # This is exactly where the real Agent failed before contacting the model.
        await agent.toolkit.remove_tool('unused_structured_output')
        yield ToolCallStartEvent(reply_id='r', tool_call_id='t', tool_call_name='query_order')
        yield ToolCallDeltaEvent(reply_id='r', tool_call_id='t', delta='{"order_id":"DD20261119001"}')
        yield ToolResultTextDeltaEvent(reply_id='r', tool_call_id='t', delta=json.dumps({'found': True, 'order': {'order_id':'DD20261119001'}}))
        yield ToolResultEndEvent(reply_id='r', tool_call_id='t', state='success')
        yield TextBlockDeltaEvent(reply_id='r', block_id='b', delta='模型核查完成')

    monkeypatch.setattr(service, '_create_agentscope_agent', lambda _: SimpleNamespace(reply_stream=reply_stream))

    async def run():
        events = [e async for e in service.chat_stream('test-model', '查物流', 'DD20261119001')]
        done = next(e['data'] for e in events if e['event'] == 'done')
        assert done['reply'] == '模型核查完成'
        assert done['tool_calls'][0]['tool_name'] == 'query_order'
        assert done['tool_calls'][0]['arguments']['order_id'] == 'DD20261119001'
        assert done['tool_calls'][0]['result']['found'] is True
    asyncio.run(run())


def test_failed_model_reports_fallback_without_exposing_error(tmp_path, monkeypatch):
    monkeypatch.setattr(runtime_config, 'model_provider', 'openai')
    monkeypatch.setattr(runtime_config, 'openai_api_key', 'test-only-placeholder')
    service = CustomerServiceOrchestrator(CSStore(str(tmp_path / 'failure.db')))

    def fail(_):
        raise RuntimeError('sensitive-provider-error-text')
    monkeypatch.setattr(service, '_create_agentscope_agent', fail)

    async def run():
        events = [e async for e in service.chat_stream('failed-model', '页面尺寸有优惠吗？')]
        done = next(e['data'] for e in events if e['event'] == 'done')
        assert done['provider'] == 'demo_fallback'
        assert [e['data']['provider'] for e in events if e['event'] == 'meta'] == ['openai', 'demo_fallback']
        assert 'sensitive-provider-error-text' not in json.dumps(events)
        assert 'SOP' in done['reply']
    asyncio.run(run())
