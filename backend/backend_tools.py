from typing import List, TypedDict
import json
import re
import sys
from datetime import datetime
import os
from nanoid import generate
import time

# 路径处理：PyInstaller 打包后 __file__ 指向临时解压目录 _MEIPASS，
# 而 sys.executable 指向 exe 实际位置。
# - 外部资源（需运行时读写）：database.json / assets / notes / .env → exe 同级目录
# - 内部资源（只读，打包进 exe）：dist（前端构建产物）→ _MEIPASS/dist
if getattr(sys, 'frozen', False):
    # 打包环境
    APP_DIR = os.path.dirname(sys.executable)
    DIST_FOLDER = os.path.join(sys._MEIPASS, 'dist')
else:
    # 开发环境
    APP_DIR = os.path.dirname(os.path.abspath(__file__))
    DIST_FOLDER = os.path.join(APP_DIR, 'dist')

DB_FILE = os.path.join(APP_DIR, 'database.json')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
ASSETS_FOLDER = os.path.join(APP_DIR, 'assets')
NOTES_FOLDER = os.path.join(APP_DIR, 'notes')

# 艾宾浩斯遗忘曲线推荐复习间隔（天数）
REVIEW_INTERVAL_DAYS: List[int] = [0, 1, 2, 4, 7, 15, 30, 60, 120, 240]

# 笔记正文中的图片引用格式：![任意内容](../assets/文件名)
# [] 里的 alt 文本按不确定处理，写入时统一用"图片"，读取时兼容任意 alt
_IMG_REF_PATTERN = re.compile(r'!\[[^\]]*\]\(\.\./assets/[^)]+\)')
# 从图片引用中提取文件名：![任意内容](../assets/img1.png) → img1.png
_IMG_NAME_PATTERN = re.compile(r'!\[[^\]]*\]\(\.\./assets/([^)]+)\)')


class Note(TypedDict):
    title: str          # 笔记标题
    subject: str        # 科目，如 "英语"
    time: str           # 时间戳（字符串形式，如 "1780547279074"）
    id: str             # 笔记唯一ID（同时作为 md 文件名）
    # content 和 imgs 不再存入 database.json，运行时从 notes/<id>.md 读取后动态注入

class ChatMessage(TypedDict):
    role: str
    content: str

class Data(TypedDict):
    notes: List[Note]       # 笔记元信息列表（不含正文）
    ai_chat: List[ChatMessage]  # AI 对话记录（单一全局列表）


def init_database()->None:
    """初始化数据库与笔记目录"""
    os.makedirs(ASSETS_FOLDER, exist_ok=True)
    os.makedirs(NOTES_FOLDER, exist_ok=True)

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


# ========== 笔记正文 Markdown 文件读写 ==========

def save_note_file(note_id: str, title: str, subject: str, content: str, imgs: List[str]) -> None:
    """把标题行 + 正文 + 图片引用写入 notes/<id>.md

    文件格式：
    第一行：# subject/title
    第二行起：content![图片](../assets/img1)![图片](../assets/img2)...
    """
    header = f'# {subject}/{title}'
    parts = []
    if content:
        parts.append(content)
    for img in imgs:
        parts.append(f'![图片](../assets/{img})')
    file_content = header + '\n' + ''.join(parts)
    with open(os.path.join(NOTES_FOLDER, f'{note_id}.md'), 'w', encoding='utf-8') as f:
        f.write(file_content)


def read_note_file(note_id: str) -> str:
    """读取 notes/<id>.md，去掉第一行标题行（# subject/title）和图片引用，返回纯正文 content"""
    path = os.path.join(NOTES_FOLDER, f'{note_id}.md')
    if not os.path.exists(path):
        return ''
    with open(path, 'r', encoding='utf-8') as f:
        raw = f.read()
    # 去掉第一行标题行
    newline_idx = raw.find('\n')
    if newline_idx != -1:
        raw = raw[newline_idx + 1:]
    else:
        # 只有标题行，没有正文
        raw = ''
    # 剥离 ![图片](../assets/xxx) 引用，只返回正文
    return _IMG_REF_PATTERN.sub('', raw)


def read_note_imgs(note_id: str) -> List[str]:
    """从 notes/<id>.md 中解析图片引用，返回图片文件名列表"""
    path = os.path.join(NOTES_FOLDER, f'{note_id}.md')
    if not os.path.exists(path):
        return []
    with open(path, 'r', encoding='utf-8') as f:
        raw = f.read()
    return _IMG_NAME_PATTERN.findall(raw)


# ========== 纯数据访问函数（可被路由和AI工具复用）==========

def fetch_notes_by_ids(ids: List[str]) -> dict:
    """根据ID列表批量获取笔记（含正文 content 和 imgs，均从 md 文件读取）"""
    try:
        if not ids:
            return {'status': 'success', 'notes': []}
        notes: List[Note] = load_database().get('notes', [])
        id_set = set(ids)
        matched = [n for n in notes if n['id'] in id_set]
        # 为每条笔记补充正文 content 和 imgs（均从 md 文件读取）
        for n in matched:
            n['content'] = read_note_file(n['id'])
            n['imgs'] = read_note_imgs(n['id'])
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

def search_notes(keyword: str) -> dict:
    """根据关键词搜索笔记，返回匹配的笔记（精简字段：id/title/subject，仅匹配标题/科目，大小写不敏感）"""
    try:
        if not keyword.strip():
            return {'status': 'success', 'notes': []}
        notes: List[Note] = load_database().get('notes', [])
        q = keyword.strip().lower()
        matched = [
            n for n in notes
            if q in n['title'].lower()
            or q in n['subject'].lower()
        ]
        light = [{'id': n['id'], 'title': n['title'], 'subject': n['subject']} for n in matched]
        return {'status': 'success', 'notes': light}
    except Exception as e:
        return {'status': 'error', 'message': f'搜索失败: {str(e)}'}

def add_note(title: str, subject: str, content: str='', timestamp: str=None, imgs: List[str]=[], id: str=None) -> None:
    """添加笔记元信息到 database.json，并把正文+图片引用写入 notes/<id>.md

    database.json 只存 title/subject/time/id；imgs 只存在于 md 文件中。
    """
    if timestamp is None:
        timestamp = str(int(time.time() * 1000))
    if id is None:
        id = generate()

    db_data = load_database()
    notes: List[Note] = db_data.get('notes', [])
    notes.append({
        'title': title,
        'subject': subject,
        'time': timestamp,
        'id': id
    })
    db_data['notes'] = notes
    with open(DB_FILE, 'w', encoding='utf-8') as f:
        json.dump(db_data, f, ensure_ascii=False, indent=2)

    # 正文 + 图片引用写入 md 文件
    save_note_file(id, title, subject, content, imgs)

def update_note(id: str, title: str, subject: str, content: str='', imgs: List[str]=None) -> dict:
    """更新笔记元信息到 database.json，并重写 notes/<id>.md（不修改时间戳）

    database.json 只更新 title/subject；imgs 只通过 md 文件保存。
    """
    db_data = load_database()
    notes: List[Note] = db_data.get('notes', [])

    note_index = next((i for i, n in enumerate(notes) if n['id'] == id), None)
    if note_index is None:
        return {'status': 'error', 'message': '笔记不存在'}

    updated_note = notes[note_index]
    updated_note['title'] = title
    updated_note['subject'] = subject

    with open(DB_FILE, 'w', encoding='utf-8') as f:
        json.dump(db_data, f, ensure_ascii=False, indent=2)

    # 重写 md 文件（content + imgs 引用）
    final_imgs = imgs if imgs is not None else []
    save_note_file(id, title, subject, content, final_imgs)

    return {'status': 'success', 'message': '笔记更新成功', 'data': updated_note}

def delete_notes(ids: List[str]) -> dict:
    """根据ID列表批量删除笔记、关联的图片文件与 md 文件

    图片文件名从 md 文件中解析得出（database.json 不再存 imgs）。
    """
    try:
        if not ids:
            return {'status': 'error', 'message': 'ID列表不能为空'}
        db_data = load_database()
        notes: List[Note] = db_data.get('notes', [])
        id_set = set(ids)

        # 先收集要删除的笔记
        to_delete = [n for n in notes if n['id'] in id_set]
        for note in to_delete:
            # 从 md 文件解析出图片列表，删除关联图片
            imgs = read_note_imgs(note['id'])
            for img in imgs:
                img_path = os.path.join(ASSETS_FOLDER, img)
                if os.path.exists(img_path):
                    os.remove(img_path)
            # 删除 md 文件
            md_path = os.path.join(NOTES_FOLDER, f"{note['id']}.md")
            if os.path.exists(md_path):
                os.remove(md_path)

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
