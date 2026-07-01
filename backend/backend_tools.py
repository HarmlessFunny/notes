from typing import List, TypedDict
import json
import re
import sys
from datetime import datetime
import os
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
_IMG_REF_PATTERN = re.compile(r'!\[[^\]]*\]\(\.\./assets/[^)]+\)')
_IMG_NAME_PATTERN = re.compile(r'!\[[^\]]*\]\(\.\./assets/([^)]+)\)')

# title 中不允许出现的字符（Windows 文件名非法字符）
_ILLEGAL_TITLE_CHARS = re.compile(r'[\\/:*?"<>|]')

# 内存内容缓存：title -> 纯正文 content（不含标题行和图片引用）
_content_cache: dict[str, str] = {}


def _refresh_content_cache() -> None:
    """清空并重新加载所有笔记正文到内存缓存"""
    _content_cache.clear()
    try:
        notes = load_database().get('notes', [])
        for note in notes:
            _content_cache[note['title']] = read_note_file(note['title'])
    except Exception:
        pass


class Note(TypedDict):
    title: str          # 笔记标题（唯一标识，同时作为 md 文件名）
    subject: str        # 科目，如 "英语"
    time: str           # 时间戳（字符串形式，如 "1780547279074"）
    # content 和 imgs 不存入 database.json，运行时从 notes/<title>.md 读取后动态注入

class ChatMessage(TypedDict):
    role: str
    content: str

class Data(TypedDict):
    notes: List[Note]
    ai_chat: List[ChatMessage]


def validate_title(title: str) -> str | None:
    """校验 title 合法性，返回错误信息（None 表示合法）"""
    if not title.strip():
        return '标题不能为空'
    if _ILLEGAL_TITLE_CHARS.search(title):
        return '标题不能包含以下字符：\\ / : * ? " < > |'
    if len(title) > 200:
        return '标题过长（最多 200 字符）'
    return None


def init_database()->None:
    """初始化数据库与笔记目录"""
    os.makedirs(ASSETS_FOLDER, exist_ok=True)
    os.makedirs(NOTES_FOLDER, exist_ok=True)

    if not os.path.exists(DB_FILE):
        with open(DB_FILE, 'w', encoding='utf-8') as f:
            json.dump({'notes': [], 'ai_chat': []}, f, ensure_ascii=False, indent=2)

    _refresh_content_cache()

def days_difference(later_timestamp: str, earlier_timestamp: str) -> int:
    sec1 = int(later_timestamp) / 1000.0
    sec2 = int(earlier_timestamp) / 1000.0
    date1 = datetime.fromtimestamp(sec1).date()
    date2 = datetime.fromtimestamp(sec2).date()
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
    if 'ai_chat' not in data:
        data['ai_chat'] = []
        with open(DB_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    return data


# ========== AI 对话记录 ==========

def fetch_ai_chat() -> dict:
    try:
        messages: List[ChatMessage] = load_database().get('ai_chat', [])
        return {'status': 'success', 'messages': messages}
    except Exception as e:
        return {'status': 'error', 'message': str(e)}

def save_ai_chat(messages: List[ChatMessage]) -> dict:
    try:
        db_data = load_database()
        db_data['ai_chat'] = messages
        with open(DB_FILE, 'w', encoding='utf-8') as f:
            json.dump(db_data, f, ensure_ascii=False, indent=2)
        return {'status': 'success'}
    except Exception as e:
        return {'status': 'error', 'message': str(e)}

def delete_ai_chat() -> dict:
    try:
        db_data = load_database()
        db_data['ai_chat'] = []
        with open(DB_FILE, 'w', encoding='utf-8') as f:
            json.dump(db_data, f, ensure_ascii=False, indent=2)
        return {'status': 'success'}
    except Exception as e:
        return {'status': 'error', 'message': str(e)}


# ========== 图片保存 ==========

def allowed_file(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def save_images(images: List, safe_title: str) -> List[str]:
    """把上传的图片保存到 assets 目录，返回文件名列表。自动处理重名。"""
    saved: List[str] = []
    for idx, file in enumerate(images):
        if not file or not allowed_file(file.filename):
            continue
        ext = os.path.splitext(file.filename)[1].lower()
        filename = f"{safe_title}{ext}" if len(images) == 1 else f"{safe_title}_{idx + 1}{ext}"
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

def save_note_file(title: str, subject: str, content: str, imgs: List[str]) -> None:
    """把标题行 + 正文 + 图片引用写入 notes/<title>.md"""
    header = f'# {subject}/{title}'
    parts = []
    if content:
        parts.append(content)
    for img in imgs:
        parts.append(f'![图片](../assets/{img})')
    file_content = header + '\n' + ''.join(parts)
    with open(os.path.join(NOTES_FOLDER, f'{title}.md'), 'w', encoding='utf-8') as f:
        f.write(file_content)
    # 同步更新内存缓存（去掉标题行和图片引用，只存纯正文）
    _content_cache[title] = _IMG_REF_PATTERN.sub('', content) if content else ''

def read_note_file(title: str) -> str:
    """读取 notes/<title>.md，去掉第一行标题行和图片引用，返回纯正文 content"""
    path = os.path.join(NOTES_FOLDER, f'{title}.md')
    if not os.path.exists(path):
        return ''
    with open(path, 'r', encoding='utf-8') as f:
        raw = f.read()
    newline_idx = raw.find('\n')
    if newline_idx != -1:
        raw = raw[newline_idx + 1:]
    else:
        raw = ''
    return _IMG_REF_PATTERN.sub('', raw)

def read_note_imgs(title: str) -> List[str]:
    """从 notes/<title>.md 中解析图片引用，返回图片文件名列表"""
    path = os.path.join(NOTES_FOLDER, f'{title}.md')
    if not os.path.exists(path):
        return []
    with open(path, 'r', encoding='utf-8') as f:
        raw = f.read()
    return _IMG_NAME_PATTERN.findall(raw)


# ========== 数据访问函数 ==========

def fetch_notes_by_titles(titles: List[str]) -> dict:
    """根据标题列表批量获取笔记（含正文 content 和 imgs，均从 md 文件读取）"""
    try:
        if not titles:
            return {'status': 'success', 'notes': []}
        notes: List[Note] = load_database().get('notes', [])
        title_set = set(titles)
        matched = [n for n in notes if n['title'] in title_set]
        for n in matched:
            n['content'] = read_note_file(n['title'])
            n['imgs'] = read_note_imgs(n['title'])
        return {'status': 'success', 'notes': matched}
    except Exception as e:
        return {'status': 'error', 'message': f'批量获取笔记失败: {str(e)}'}

def fetch_all_notes() -> dict:
    """获取所有笔记（不含 content 和 imgs）"""
    try:
        notes: List[Note] = load_database().get('notes', [])
        return {'status': 'success', 'notes': notes}
    except Exception as e:
        return {'status': 'error', 'message': f'加载数据失败: {str(e)}'}

def fetch_notes_by_day(someday: str) -> dict:
    """根据时间戳获取指定天数差的笔记"""
    try:
        notes = load_database()['notes']
        filtered = filter_by_days_difference(notes, someday, REVIEW_INTERVAL_DAYS)
        return {'status': 'success', 'notes': filtered}
    except Exception as e:
        return {'status': 'error', 'message': f'加载数据失败: {str(e)}'}

def search_notes(keyword: str) -> dict:
    """根据关键词搜索笔记（匹配标题/科目/正文，大小写不敏感），正文使用内存缓存"""
    try:
        if not keyword.strip():
            return {'status': 'success', 'notes': []}
        notes: List[Note] = load_database().get('notes', [])
        q = keyword.strip().lower()
        matched: List[Note] = []
        for n in notes:
            if q in n['title'].lower() or q in n['subject'].lower():
                matched.append(n)
            elif q in _content_cache.get(n['title'], '').lower():
                matched.append(n)
        return {'status': 'success', 'notes': matched}
    except Exception as e:
        return {'status': 'error', 'message': f'搜索失败: {str(e)}'}

def add_note(title: str, subject: str, content: str='', timestamp: str=None, imgs: List[str]=[]) -> dict:
    """添加笔记，校验 title 唯一性与合法性"""
    err = validate_title(title)
    if err:
        return {'status': 'error', 'message': err}
    if timestamp is None:
        timestamp = str(int(time.time() * 1000))

    db_data = load_database()
    notes: List[Note] = db_data.get('notes', [])

    # 唯一性校验
    if any(n['title'] == title for n in notes):
        return {'status': 'error', 'message': f'标题「{title}」已存在，请更换标题'}

    notes.append({'title': title, 'subject': subject, 'time': timestamp})
    db_data['notes'] = notes
    with open(DB_FILE, 'w', encoding='utf-8') as f:
        json.dump(db_data, f, ensure_ascii=False, indent=2)

    save_note_file(title, subject, content, imgs)
    return {'status': 'success'}

def update_note(old_title: str, new_title: str, subject: str, content: str='', imgs: List[str]=None) -> dict:
    """更新笔记。old_title 用于定位笔记，new_title 为新标题（改名时需重命名 md 文件）"""
    err = validate_title(new_title)
    if err:
        return {'status': 'error', 'message': err}

    db_data = load_database()
    notes: List[Note] = db_data.get('notes', [])

    note_index = next((i for i, n in enumerate(notes) if n['title'] == old_title), None)
    if note_index is None:
        return {'status': 'error', 'message': '笔记不存在'}

    # 如果标题变了，检查新标题不与其他笔记冲突
    if new_title != old_title:
        if any(n['title'] == new_title for i, n in enumerate(notes) if i != note_index):
            return {'status': 'error', 'message': f'标题「{new_title}」已存在，请更换标题'}

    updated_note = notes[note_index]
    title_changed = new_title != old_title
    updated_note['title'] = new_title
    updated_note['subject'] = subject

    with open(DB_FILE, 'w', encoding='utf-8') as f:
        json.dump(db_data, f, ensure_ascii=False, indent=2)

    final_imgs = imgs if imgs is not None else []
    save_note_file(new_title, subject, content, final_imgs)

    # 改名时删除旧 md 文件并清理缓存
    if title_changed:
        _content_cache.pop(old_title, None)
        old_md = os.path.join(NOTES_FOLDER, f'{old_title}.md')
        if os.path.exists(old_md):
            os.remove(old_md)

    return {'status': 'success', 'message': '笔记更新成功'}

def delete_notes(titles: List[str]) -> dict:
    """根据标题列表批量删除笔记、关联的图片文件与 md 文件"""
    try:
        if not titles:
            return {'status': 'error', 'message': '标题列表不能为空'}
        db_data = load_database()
        notes: List[Note] = db_data.get('notes', [])
        title_set = set(titles)

        to_delete = [n for n in notes if n['title'] in title_set]
        for note in to_delete:
            _content_cache.pop(note['title'], None)
            imgs = read_note_imgs(note['title'])
            for img in imgs:
                img_path = os.path.join(ASSETS_FOLDER, img)
                if os.path.exists(img_path):
                    os.remove(img_path)
            md_path = os.path.join(NOTES_FOLDER, f"{note['title']}.md")
            if os.path.exists(md_path):
                os.remove(md_path)

        remaining = [n for n in notes if n['title'] not in title_set]
        db_data['notes'] = remaining
        with open(DB_FILE, 'w', encoding='utf-8') as f:
            json.dump(db_data, f, ensure_ascii=False, indent=2)

        return {'status': 'success', 'message': f'已删除 {len(to_delete)} 篇笔记', 'deleted_count': len(to_delete)}
    except Exception as e:
        return {'status': 'error', 'message': f'删除笔记失败: {str(e)}'}
