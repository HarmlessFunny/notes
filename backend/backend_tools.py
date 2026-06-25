from typing import List, TypedDict
import json
from datetime import datetime
import os
from nanoid import generate
import time

# 配置 - 使用脚本所在目录的绝对路径
_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(_BACKEND_DIR, 'database.json')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
ASSETS_FOLDER = os.path.join(_BACKEND_DIR, 'assets')

# 艾宾浩斯遗忘曲线推荐复习间隔（天数）
REVIEW_INTERVAL_DAYS: List[int] = [0, 1, 2, 4, 7, 15, 30, 60, 120, 240]


class Note(TypedDict):
    title: str          # 笔记标题
    subject: str        # 科目，如 "英语"
    content: str        # 笔记内容
    time: str           # 时间戳（字符串形式，如 "1780547279074"）
    imgs: List[str]     # 关联的图片文件名列表
    tags: List[str]     # 标签列表

class ChatMessage(TypedDict):
    role: str
    content: str

class Data(TypedDict):
    notes: List[Note]       # 笔记列表
    ai_chat: List[ChatMessage]  # AI 对话记录（单一全局列表）


def init_database()->None:
    """初始化数据库"""
    os.makedirs(ASSETS_FOLDER, exist_ok=True)

    if not os.path.exists(DB_FILE):
        with open(DB_FILE, 'w', encoding='utf-8') as f:
            json.dump({'notes': [], 'ai_chat': []}, f, ensure_ascii=False, indent=2)

def days_difference(later_timestamp: str, earlier_timestamp: str) -> int:
    sec1 = int(later_timestamp) / 1000.0
    sec2 = int(earlier_timestamp) / 1000.0
    
    # 转为 UTC datetime，再提取日期部分
    date1 = datetime.fromtimestamp(sec1).date()
    date2 = datetime.fromtimestamp(sec2).date()
    
    # 返回日期差的天数
    return (date1 - date2).days

def filter_by_days_difference(notes: List[Note], target_timestamp: str, target_diffs: List[int]) -> List[Note]:
    result = []
    for item in notes:
        diff = days_difference(target_timestamp, item['time'])
        if diff in target_diffs:
            result.append(item)
    return result
    
def load_database()->Data:
    """加载数据库数据"""
    with open(DB_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
    # 兼容旧数据库文件（没有 ai_chat 字段）
    if 'ai_chat' not in data:
        data['ai_chat'] = []
        with open(DB_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    return data


# ========== AI 对话记录（单一全局列表）==========

def fetch_ai_chat() -> dict:
    """获取当前对话记录"""
    try:
        messages: List[ChatMessage] = load_database().get('ai_chat', [])
        return {'status': 'success', 'messages': messages}
    except Exception as e:
        return {'status': 'error', 'message': str(e)}


def save_ai_chat(messages: List[ChatMessage]) -> dict:
    """保存完整对话记录（覆盖）"""
    try:
        db_data = load_database()
        db_data['ai_chat'] = messages
        with open(DB_FILE, 'w', encoding='utf-8') as f:
            json.dump(db_data, f, ensure_ascii=False, indent=2)
        return {'status': 'success'}
    except Exception as e:
        return {'status': 'error', 'message': str(e)}


def delete_ai_chat() -> dict:
    """清空对话记录"""
    try:
        db_data = load_database()
        db_data['ai_chat'] = []
        with open(DB_FILE, 'w', encoding='utf-8') as f:
            json.dump(db_data, f, ensure_ascii=False, indent=2)
        return {'status': 'success'}
    except Exception as e:
        return {'status': 'error', 'message': str(e)}

def allowed_file(filename: str) -> bool:
    """检查文件类型是否允许"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def save_images(images: List, safe_title: str) -> List[str]:
    """把上传的图片保存到 assets 目录，返回文件名列表。自动处理重名。"""
    saved: List[str] = []
    for idx, file in enumerate(images):
        if not file or not allowed_file(file.filename):
            continue
        ext = os.path.splitext(file.filename)[1].lower()
        # 单张图片直接用标题，多张则加索引
        filename = f"{safe_title}{ext}" if len(images) == 1 else f"{safe_title}_{idx + 1}{ext}"

        # 若已存在，则拼接时间戳避免覆盖
        counter = 1
        original = filename
        while os.path.exists(os.path.join(ASSETS_FOLDER, filename)):
            name, ext = os.path.splitext(original)
            filename = f"{name}_{counter}_{int(time.time() * 1000)}{ext}"
            counter += 1

        file.save(os.path.join(ASSETS_FOLDER, filename))
        saved.append(filename)
    return saved



# ========== 纯数据访问函数（可被路由和AI工具复用）==========

def fetch_notes_by_ids(ids: List[str]) -> dict:
    """根据ID列表批量获取笔记"""
    try:
        if not ids:
            return {'status': 'success', 'notes': []}
        notes: List[Note] = load_database().get('notes', [])
        id_set = set(ids)
        matched = [n for n in notes if n['id'] in id_set]
        return {'status': 'success', 'notes': matched}
    except Exception as e:
        return {'status': 'error', 'message': f'批量获取笔记失败: {str(e)}'}

def fetch_all_notes() -> dict:
    """获取所有笔记（精简字段：id/title/subject）"""
    try:
        notes: List[Note] = load_database().get('notes', [])
        light = [{'id': n['id'], 'title': n['title'], 'subject': n['subject']} for n in notes]
        return {'status': 'success', 'notes': light}
    except Exception as e:
        return {'status': 'error', 'message': f'加载数据失败: {str(e)}'}

def fetch_notes_by_day(someday: str) -> dict:
    """根据时间戳获取指定天数差的笔记（精简字段：id/title/subject）"""
    try:
        notes = load_database()['notes']
        filtered = filter_by_days_difference(notes, someday, REVIEW_INTERVAL_DAYS)
        light = [{'id': n['id'], 'title': n['title'], 'subject': n['subject']} for n in filtered]
        return {'status': 'success', 'notes': light}
    except Exception as e:
        return {'status': 'error', 'message': f'加载数据失败: {str(e)}'}

def fetch_notes_by_tag(tag: str) -> dict:
    """根据标签搜索笔记，返回匹配的笔记（精简字段：id/title/subject）"""
    try:
        if not tag.strip():
            return {'status': 'success', 'notes': []}
        notes: List[Note] = load_database().get('notes', [])
        q = tag.strip().lower()
        matched = [n for n in notes if any(q == t.lower() for t in n.get('tags', []))]
        light = [{'id': n['id'], 'title': n['title'], 'subject': n['subject']} for n in matched]
        return {'status': 'success', 'notes': light}
    except Exception as e:
        return {'status': 'error', 'message': f'标签搜索失败: {str(e)}'}

def fetch_note_by_id(id: str) -> dict:
    """根据ID获取笔记"""
    try:
        notes: List[Note] = load_database().get('notes', [])
        note = next((n for n in notes if n['id'] == id), None)
        if note:
            return {'status': 'success', 'note': note}
        else:
            return {'status': 'error', 'message': '笔记不存在'}
    except Exception as e:
        return {'status': 'error', 'message': f'加载数据失败: {str(e)}'}

def search_notes(keyword: str) -> dict:
    """根据关键词搜索笔记，返回匹配的笔记（精简字段：id/title/subject，匹配标题/科目/内容/标签，大小写不敏感）"""
    try:
        if not keyword.strip():
            return {'status': 'success', 'notes': []}
        notes: List[Note] = load_database().get('notes', [])
        q = keyword.strip().lower()
        matched = [
            n for n in notes
            if q in n['title'].lower()
            or q in n['subject'].lower()
            or q in n.get('content', '').lower()
            or any(q in tag.lower() for tag in n.get('tags', []))
        ]
        light = [{'id': n['id'], 'title': n['title'], 'subject': n['subject']} for n in matched]
        return {'status': 'success', 'notes': light}
    except Exception as e:
        return {'status': 'error', 'message': f'搜索失败: {str(e)}'}

def add_note(title: str, subject: str, content: str='', timestamp: str=None, imgs: List[str]=[], id: str=None, tags: List[str]=None) -> None:
    """添加笔记到数据库"""
    if timestamp is None:
        timestamp = str(int(time.time() * 1000))
    if id is None:
        id = generate()
    if tags is None:
        tags = []
    
    db_data = load_database()
    notes: List[Note] = db_data.get('notes', [])
    notes.append({
        'title': title,
        'subject': subject,
        'content': content,
        'time': timestamp,
        'imgs': imgs,
        'tags': tags,
        'id': id
    })
    db_data['notes'] = notes
    with open(DB_FILE, 'w', encoding='utf-8') as f:
        json.dump(db_data, f, ensure_ascii=False, indent=2)

def update_note(id: str, title: str, subject: str, content: str='', imgs: List[str]=None, tags: List[str]=None) -> dict:
    """更新笔记（纯函数，不修改时间戳和图片列表）"""
    db_data = load_database()
    notes: List[Note] = db_data.get('notes', [])
    
    note_index = next((i for i, n in enumerate(notes) if n['id'] == id), None)
    if note_index is None:
        return {'status': 'error', 'message': '笔记不存在'}
    
    updated_note = notes[note_index]
    updated_note['title'] = title
    updated_note['subject'] = subject
    updated_note['content'] = content
    if imgs is not None:
        updated_note['imgs'] = imgs
    if tags is not None:
        updated_note['tags'] = tags
    
    with open(DB_FILE, 'w', encoding='utf-8') as f:
        json.dump(db_data, f, ensure_ascii=False, indent=2)
    
    return {'status': 'success', 'message': '笔记更新成功', 'data': updated_note}

def delete_notes(ids: List[str]) -> dict:
    """根据ID列表批量删除笔记及其关联的图片文件"""
    try:
        if not ids:
            return {'status': 'error', 'message': 'ID列表不能为空'}
        db_data = load_database()
        notes: List[Note] = db_data.get('notes', [])
        id_set = set(ids)

        # 先收集要删除的笔记的图片
        to_delete = [n for n in notes if n['id'] in id_set]
        for note in to_delete:
            for img in note.get('imgs', []):
                img_path = os.path.join(ASSETS_FOLDER, img)
                if os.path.exists(img_path):
                    os.remove(img_path)

        # 从数据库中移除笔记
        remaining = [n for n in notes if n['id'] not in id_set]
        db_data['notes'] = remaining
        with open(DB_FILE, 'w', encoding='utf-8') as f:
            json.dump(db_data, f, ensure_ascii=False, indent=2)

        deleted_count = len(to_delete)
        return {'status': 'success', 'message': f'已删除 {deleted_count} 篇笔记', 'deleted_count': deleted_count}
    except Exception as e:
        return {'status': 'error', 'message': f'删除笔记失败: {str(e)}'}

if __name__ == '__main__':
    print(search_notes('sin'))