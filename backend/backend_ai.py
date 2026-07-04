from openai import OpenAI
from backend_tools import fetch_all_notes, fetch_notes_by_day, fetch_notes_by_titles, search_notes, add_note, update_note, delete_notes
from backend_utils import stream_ai_response


def _fetch_note_by_title(title: str) -> dict:
    """单条查询的薄包装：复用 fetch_notes_by_titles，返回 {note: {...}} 格式供 AI 工具使用"""
    result = fetch_notes_by_titles([title])
    if result['status'] == 'success' and result.get('notes'):
        return {'status': 'success', 'note': result['notes'][0]}
    return {'status': 'error', 'message': '笔记不存在'}

tools = [
    {
        "type": "function",
        "function": {
            "name": "fetch_note_by_title",
            "description": "根据标题获取单篇笔记的详细内容",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "笔记标题"}
                },
                "required": ["title"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_all_notes",
            "description": "获取所有笔记的标题、科目列表（如果想查看详细内容，调用fetch_note_by_title工具）",
            "parameters": {
                "type": "object",
                "properties": {},
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_notes_by_day",
            "description": "根据时间戳获取某一天需要复习的笔记标题、科目列表（如果想查看详细内容，调用fetch_note_by_title工具）",
            "parameters": {
                "type": "object",
                "properties": {
                    "someday": {"type": "string", "description": "毫秒级时间戳字符串（13位）"}
                },
                "required": ["someday"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "search_notes",
            "description": "根据关键词搜索笔记，匹配标题、科目（大小写不敏感），返回匹配的笔记标题、科目列表（如果想查看详细内容，调用fetch_note_by_title工具）",
            "parameters": {
                "type": "object",
                "properties": {
                    "keyword": {"type": "string", "description": "搜索关键词"}
                },
                "required": ["keyword"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "add_note",
            "description": "添加新笔记到数据库（标题必须唯一，不能包含 \\ / : * ? \" < > | 等字符）",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "笔记标题（唯一标识）"},
                    "subject": {"type": "string", "description": "笔记科目"},
                    "content": {"type": "string", "description": "笔记内容"},
                    "timestamp": {"type": "string", "description": "毫秒级时间戳字符串（自动生成）"},
                    "imgs": {"type": "array", "items": {"type": "string", "description": "笔记图片URL列表（无需生成）"}}
                },
                "required": ["title", "subject", "content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "delete_notes",
            "description": "根据标题列表批量删除多篇笔记及其关联的图片文件（最好在调用之前先向用户确认要删除的笔记）",
            "parameters": {
                "type": "object",
                "properties": {
                    "titles": {"type": "array", "items": {"type": "string"}, "description": "要删除的笔记标题数组"}
                },
                "required": ["titles"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "update_note",
            "description": "更新单篇笔记的标题、科目、内容等信息（不修改时间戳和图片）",
            "parameters": {
                "type": "object",
                "properties": {
                    "old_title": {"type": "string", "description": "要修改的笔记的当前标题"},
                    "new_title": {"type": "string", "description": "新标题（与旧标题相同时表示不改名）"},
                    "subject": {"type": "string", "description": "笔记科目"},
                    "content": {"type": "string", "description": "笔记内容"}
                },
                "required": ["old_title", "new_title", "subject", "content"]
            }
        }
    },
]

TOOL_CALL_MAP = {
    "fetch_note_by_title": _fetch_note_by_title,
    "fetch_all_notes": fetch_all_notes,
    "fetch_notes_by_day": fetch_notes_by_day,
    "search_notes": search_notes,
    "add_note": add_note,
    "update_note": update_note,
    "delete_notes": delete_notes
}



def ai_chat(client: OpenAI, chat_model_name: str, messages: list, reasoning_effort: str = None):
    """流式版本：使用 SSE 逐块返回 AI 回复内容，Function Calling 在服务端透明处理"""
    yield from stream_ai_response(
        client,
        chat_model_name,
        messages,
        tools=tools,
        tool_call_map=TOOL_CALL_MAP,
        reasoning_effort=reasoning_effort,
    )


