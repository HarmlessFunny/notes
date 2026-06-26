import json
from openai import OpenAI
from backend_tools import fetch_all_notes, fetch_notes_by_day, fetch_note_by_id, search_notes, add_note, update_note, delete_notes
from backend_utils import stream_ai_response

tools = [
    {
        "type": "function",
        "function": {
            "name": "fetch_note_by_id",
            "description": "根据ID获取单篇笔记的详细内容",
            "parameters": {
                "type": "object",
                "properties": {
                    "id": {"type": "string", "description": "笔记ID"}
                },
                "required": ["id"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_all_notes",
            "description": "获取所有笔记ID、标题、科目列表（如果想查看详细内容，调用fetch_note_by_id工具）",
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
            "description": "根据时间戳获取某一天的需要复习的笔记ID、标题、科目列表（如果想查看详细内容，调用fetch_note_by_id工具）",
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
            "description": "根据关键词搜索笔记，匹配标题、科目、内容（大小写不敏感），返回匹配的笔记ID、标题、科目列表（如果想查看详细内容，调用fetch_note_by_id工具）",
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
            "description": "添加新笔记到数据库",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "笔记标题"},
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
            "description": "根据ID列表批量删除多篇笔记及其关联的图片文件（最好在调用之前先向用户确认要删除的笔记）",
            "parameters": {
                "type": "object",
                "properties": {
                    "ids": {"type": "array", "items": {"type": "string"}, "description": "要删除的笔记ID数组"}
                },
                "required": ["ids"]
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
                    "id": {"type": "string", "description": "要修改的笔记ID"},
                    "title": {"type": "string", "description": "笔记标题"},
                    "subject": {"type": "string", "description": "笔记科目"},
                    "content": {"type": "string", "description": "笔记内容"}
                },
                "required": ["id", "title", "subject", "content"]
            }
        }
    },
]

TOOL_CALL_MAP = {
    "fetch_note_by_id": fetch_note_by_id,
    "fetch_all_notes": fetch_all_notes,
    "fetch_notes_by_day": fetch_notes_by_day,
    "search_notes": search_notes,
    "add_note": add_note,
    "update_note": update_note,
    "delete_notes": delete_notes
}



def ai_chat(client: OpenAI, model_name: str, messages: list):
    """流式版本：使用 SSE 逐块返回 AI 回复内容，Function Calling 在服务端透明处理"""
    yield from stream_ai_response(
        client,
        model_name,
        messages,
        tools=tools,
        tool_call_map=TOOL_CALL_MAP
    )


QUIZ_SYSTEM_PROMPT = """
    你是一位严格且有经验的老师。根据用户提供的笔记内容，出一套练习题，覆盖笔记中的所有知识点。

    题目类型比例：填空题约占 60%，选择题约占 25%，简答题约占 15%。
    题目数量：根据笔记长度自动决定，一般 5~10 题。

    输出要求：
    1. 严格只输出 JSON，不要输出任何解释性文字。
    2. 每个题目不要包含答案，只出题目。
    3. 填空题：在题干中用 3 个下划线 `___` 表示每个填空的位置，一道题可以有多个空；同时必须输出 `blank_count` 字段，值为该题的填空数量（正整数）。
    4. 选择题：必须给出 4 个选项 A/B/C/D，只有一个正确答案；`options` 数组按 A、B、C、D 顺序给出选项的完整内容（例如 "A. xxx"）。
    5. 简答题：要求用户用文字叙述关键定义、定理或步骤。

    JSON 结构（严格遵守）：
    {
    "questions": [
        {
        "type": "single_choice",
        "question": "题目文本",
        "options": ["A. ...", "B. ...", "C. ...", "D. ..."]
        },
        {
        "type": "fill_blank",
        "question": "sin²x + cos²x = ___",
        "blank_count": 1
        },
        {
        "type": "fill_blank",
        "question": "函数 f(x) 在点 x0 处可导，则 f(x) 在该点一定 ___；反之不成立；导数的几何意义是 ___。",
        "blank_count": 2
        },
        {
        "type": "short_answer",
        "question": "请简述拉格朗日中值定理的内容。"
        }
    ]
    }
"""

GRADE_SYSTEM_PROMPT = """
    你是一位严格且公正的老师。根据笔记内容和学生的答案，对每道题进行批改。

    输出要求：
    1. 严格只输出 JSON，不要输出任何解释性文字。
    2. 每道题给出：是否正确 / 正确答案 / 点评建议。
    3. 选择题按选项字母 A/B/C/D 判断对错；填空题按每个空的关键词判断，允许同义词和细微表达差异；简答题按核心知识点判断。
    4. 最后给出总分和总体评价。

    输入格式说明：
    - `questions` 中的题目结构与出题函数一致，含 `type` / `question` / `options`（选择题）/ `blank_count`（填空题）
    - `user_answers` 中：
    - 选择题（single_choice）：`answer` 为选项字母 "A"/"B"/"C"/"D"
    - 填空题（fill_blank）：`answer` 为字符串数组，按题干中空的顺序对应每个空
    - 简答题（short_answer）：`answer` 为用户输入的长文本

    输出格式（严格遵守）：
    {
    "results": [
        {
        "question_index": 0,
        "is_correct": true,
        "correct_answer": "A",
        "feedback": "回答正确。..."
        },
        ...
    ],
    "score": "答对题数/总题数",
    "summary": "总体掌握情况的 1~2 句简要评价。"
    }
"""


def generate_quiz(client: OpenAI, model_name: str, note_content: str):
    """根据笔记内容生成练习题（流式输出 JSON）。"""
    user_prompt = "以下是笔记内容，请据此出一套练习题：\n\n" + note_content
    
    yield from stream_ai_response(
        client,
        model_name,
        [
            {"role": "system", "content": QUIZ_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        response_format={"type": "json_object"}
    )


def grade_quiz(client: OpenAI, model_name: str, note_content: str, questions: list, user_answers: list):
    """根据笔记内容批改用户答案（流式输出 JSON）。"""
    user_prompt = json.dumps({
        "note_content": note_content,
        "questions": questions,
        "user_answers": user_answers,
    }, ensure_ascii=False)
    
    yield from stream_ai_response(
        client,
        model_name,
        [
            {"role": "system", "content": GRADE_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        response_format={"type": "json_object"}
    )