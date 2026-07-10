import json
import base64
import os
from functools import wraps
from typing import Dict, Callable, Generator
from flask import jsonify, request, Response, stream_with_context
from backend_tools import UPLOADS_FOLDER


def api_response(func: Callable) -> Callable:
    """装饰器：统一API响应格式"""
    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            result = func(*args, **kwargs)
            # 支持 (dict, status_code) 形式
            if isinstance(result, tuple) and len(result) == 2 and isinstance(result[0], dict):
                body, status = result
                return jsonify(body), status
            if isinstance(result, dict) and 'status' in result:
                return jsonify(result)
            return jsonify({'status': 'success', 'data': result})
        except Exception as e:
            return jsonify({'status': 'error', 'message': str(e)}), 500
    return wrapper


def validate_required_fields(fields: list):
    """装饰器：验证请求中必须包含指定字段"""
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            missing = []
            if request.method in ['POST', 'PUT']:
                if request.content_type and 'multipart/form-data' in request.content_type:
                    data = request.form
                else:
                    try:
                        data = request.json or {}
                    except Exception:
                        data = {}
                for field in fields:
                    if field not in data or (data[field] is None or str(data[field]).strip() == ''):
                        missing.append(field)
            if missing:
                return jsonify({'status': 'error', 'message': f'缺少必要字段: {", ".join(missing)}'}), 400
            return func(*args, **kwargs)
        return wrapper
    return decorator


def handle_api_error(error: Exception, default_message: str = '操作失败') -> dict:
    """统一处理API错误"""
    return {
        'status': 'error',
        'message': str(error) if str(error) else default_message
    }


def handle_api_success(message: str = '操作成功') -> dict:
    """统一处理API成功"""
    return {
        'status': 'success',
        'message': message
    }


def sse_stream(func: Callable = None, *, event_generator: Callable[..., Generator] = None):
    """
    装饰器：将生成器函数包装为 SSE 响应。
    用法：
        @app.route('/api/xxx', methods=['POST'])
        @sse_stream
        def my_route():
            for event in some_ai_func():
                yield event
    """
    def decorate(target: Callable) -> Callable:
        @wraps(target)
        def wrapper(*args, **kwargs):
            def generate():
                try:
                    for event in target(*args, **kwargs):
                        yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
                except Exception as e:
                    yield f"data: {json.dumps({'type': 'error', 'content': str(e)}, ensure_ascii=False)}\n\n"

            return Response(
                stream_with_context(generate()),
                mimetype='text/event-stream',
                headers={
                    'Cache-Control': 'no-cache',
                    'X-Accel-Buffering': 'no',
                }
            )
        return wrapper

    if func is not None and callable(func):
        return decorate(func)
    return decorate


def _convert_image_url_to_base64(url: str) -> str:
    """将 /uploads/images/xxx 本地图片转为 data:image/xxx;base64,xxx 格式"""
    filename = os.path.basename(url)
    filepath = os.path.join(UPLOADS_FOLDER, filename)
    if not os.path.exists(filepath):
        return url
    with open(filepath, 'rb') as f:
        img_data = f.read()
    ext = os.path.splitext(filename)[1].lower().lstrip('.')
    mime = {'jpg': 'jpeg', 'jpeg': 'jpeg', 'png': 'png', 'gif': 'gif', 'webp': 'webp'}.get(ext, 'png')
    b64 = base64.b64encode(img_data).decode('utf-8')
    return f"data:image/{mime};base64,{b64}"


def _prepare_messages_for_api(messages: list) -> list:
    prepared = []
    for msg in messages:
        content = msg.get('content')
        if isinstance(content, list):
            new_content = []
            for part in content:
                if isinstance(part, dict) and part.get('type') == 'image_url':
                    url = part['image_url']['url']
                    if url.startswith('/uploads/images/'):
                        part['image_url']['url'] = _convert_image_url_to_base64(url)
                    new_content.append(part)
                else:
                    new_content.append(part)
            msg['content'] = new_content
        prepared.append(msg)
    return prepared


def stream_ai_response(
    client,
    model: str,
    messages: list,
    response_format: Dict[str, str] = None,
    tools: list = None,
    tool_call_map: Dict[str, Callable] = None,
    reasoning_effort: str = None
):
    """
    通用流式AI响应生成器。
    
    Args:
        client: OpenAI客户端实例
        model: 模型名称
        messages: 消息列表
        response_format: 响应格式（如 {"type": "json_object"}）
        tools: 工具定义列表（用于function calling）
        tool_call_map: 工具函数映射（用于function calling）
        reasoning_effort: 推理努力程度（仅部分模型支持，默认 None 表示不传）
    
    Yields:
        dict: {"type": "content", "content": "..."} 或 {"type": "done", "raw_json": "..."}
    """
    current_messages = _prepare_messages_for_api(json.loads(json.dumps(messages)))
    
    while True:
        params = {
            "model": model,
            "messages": current_messages,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        
        if reasoning_effort:
            params["reasoning_effort"] = reasoning_effort
        
        if response_format:
            params["response_format"] = response_format
        
        if tools:
            params["tools"] = tools
        
        response = client.chat.completions.create(**params)
        
        tool_calls_acc: dict[int, dict] = {}
        full_content = ""
        
        for chunk in response:
            choice = chunk.choices[0] if chunk.choices else None
            if choice is None:
                continue
            
            delta = choice.delta
            
            if delta and delta.content:
                content = delta.content
                full_content += content
                yield {"type": "content", "content": content}
            
            if delta and delta.tool_calls and tools:
                for tc in delta.tool_calls:
                    idx = tc.index
                    if idx not in tool_calls_acc:
                        tool_calls_acc[idx] = {
                            "id": tc.id or "",
                            "type": "function",
                            "function": {"name": "", "arguments": ""},
                        }
                    if tc.id:
                        tool_calls_acc[idx]["id"] = tc.id
                    if tc.function:
                        if tc.function.name:
                            tool_calls_acc[idx]["function"]["name"] += tc.function.name
                        if tc.function.arguments:
                            tool_calls_acc[idx]["function"]["arguments"] += tc.function.arguments
        
        if not tool_calls_acc:
            if response_format and response_format.get("type") == "json_object":
                yield {"type": "done", "raw_json": full_content}
            else:
                yield {"type": "done"}
            break
        
        assistant_msg = {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": tc["id"],
                    "type": tc["type"],
                    "function": {
                        "name": tc["function"]["name"],
                        "arguments": tc["function"]["arguments"],
                    },
                }
                for tc in tool_calls_acc.values()
            ],
        }
        current_messages.append(assistant_msg)
        
        if tool_call_map:
            for tc in tool_calls_acc.values():
                func_name = tc["function"]["name"]
                try:
                    func_args = json.loads(tc["function"]["arguments"]) if tc["function"]["arguments"] else {}
                except json.JSONDecodeError:
                    func_args = {}
                
                tool_func = tool_call_map.get(func_name)
                if tool_func:
                    result = tool_func(**func_args)
                    current_messages.append({
                        "role": "tool",
                        "tool_call_id": tc["id"],
                        "content": json.dumps(result, ensure_ascii=False),
                    })
                else:
                    current_messages.append({
                        "role": "tool",
                        "tool_call_id": tc["id"],
                        "content": json.dumps({"status": "error", "message": f"未知工具: {func_name}"}, ensure_ascii=False),
                    })