import os
import json
import sys
import time
import re
from flask import Flask, request, jsonify, send_from_directory, send_file, stream_with_context
from flask_cors import CORS
from typing import Tuple, Any
from backend_ai import ai_chat, generate_quiz, grade_quiz
from openai import OpenAI
from backend_tools import init_database, fetch_all_notes, fetch_notes_by_day, fetch_note_by_id, search_notes, fetch_notes_by_ids, add_note, update_note, delete_notes, save_images, fetch_ai_chat, save_ai_chat, delete_ai_chat, Note, DB_FILE, ASSETS_FOLDER, DIST_FOLDER, APP_DIR
from backend_utils import api_response, validate_required_fields, handle_api_error, sse_stream
from dotenv import load_dotenv


# 加载环境变量
if getattr(sys, 'frozen', False):
    # 从 exe/脚本同级目录的 .env 读取
    load_dotenv(os.path.join(APP_DIR, '.env'))
else:
    # 从当前脚本所在目录的 .env 读取
    load_dotenv(os.path.join(APP_DIR, '..', '.env'))

# 初始化数据库
init_database()

# 检查环境变量
api_key = os.getenv("API_KEY")
if not api_key:
    raise RuntimeError("请设置 API_KEY 环境变量")

base_url = os.getenv("BASE_URL")
if not base_url:
    raise RuntimeError("请设置 BASE_URL 环境变量")

model_name = os.getenv("MODEL_NAME")
if not model_name:
    raise RuntimeError("请设置 MODEL_NAME 环境变量")

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

# 初始化 OpenAI 客户端
client = OpenAI(
    api_key=api_key,
    base_url=base_url,
)

# ========== Flask 路由（使用装饰器优化）==========
@app.route('/api/notes/<someday>', methods=['GET'])
@api_response
def get_notes_by_day_route(someday: str) -> dict:
    """获取指定时间差的笔记（精简字段）"""
    return fetch_notes_by_day(someday)


@app.route('/api/notes', methods=['GET'])
@api_response
def get_all_notes_route() -> dict:
    """获取所有笔记（精简字段）"""
    return fetch_all_notes()


@app.route('/api/note/<id>', methods=['GET'])
@api_response
def get_note_by_id_route(id: str) -> dict:
    """根据ID获取笔记"""
    result = fetch_notes_by_ids([id])
    if result['status'] == 'success' and result.get('notes'):
        return {'status': 'success', 'note': result['notes'][0]}
    else:
        return {'status': 'error', 'message': '笔记不存在'}


@app.route('/api/notes/search', methods=['GET'])
@api_response
def search_notes_route() -> dict:
    """根据关键词搜索笔记，返回匹配的笔记列表（精简字段）"""
    keyword = request.args.get('q', '').strip()
    return search_notes(keyword)


@app.route('/api/notes/batch', methods=['POST'])
@api_response
def batch_notes_route() -> dict:
    """根据ID列表批量获取笔记"""
    ids = request.json.get('ids', [])
    return fetch_notes_by_ids(ids)


@app.route('/assets/<filename>', methods=['GET'])
def serve_image_route(filename: str) -> Tuple[Any, int]:
    """提供图片访问（先查上传目录，再查前端构建目录）"""
    user_path = os.path.join(ASSETS_FOLDER, filename)
    if os.path.exists(user_path):
        return send_file(user_path), 200
    
    dist_path = os.path.join(DIST_FOLDER, 'assets', filename)
    if os.path.exists(dist_path):
        return send_file(dist_path), 200
    
    return jsonify({
        'status': 'error',
        'message': '图片不存在',
        'path': user_path
    }), 404


@app.route('/api/submit', methods=['POST'])
@validate_required_fields(['title', 'subject'])
@api_response
def submit_note_route() -> dict:
    """接收表单提交和图片上传"""
    title = request.form.get('title', '').strip()
    subject = request.form.get('subject', '').strip()
    timestamp = request.form.get('timestamp', '').strip() or str(int(time.time() * 1000))
    content = request.form.get('content', '').strip()
    id = request.form.get('id', '').strip()

    images = request.files.getlist('images')
    safe_title = re.sub(r'[\\/:*?"<>|]', '_', title.strip())[:30] or f"note_{int(time.time())}"
    saved_images = save_images(images, safe_title)
    
    note_data: Note = {
        'title': title,
        'subject': subject,
        'content': content,
        'time': timestamp,
        'imgs': saved_images,
        'id': id
    }
    
    add_note(title, subject, content, timestamp, saved_images, id)
    
    return {
        'status': 'success',
        'message': '笔记发布成功',
        'data': note_data
    }


@app.route('/api/notes/delete', methods=['DELETE'])
@api_response
def delete_selected_notes_route() -> dict:
    """根据ID列表批量删除笔记（同时清理关联的图片文件）"""
    ids = request.json.get('ids', [])
    if not ids:
        return {'status': 'error', 'message': '请选择要删除的笔记'}
    
    return delete_notes(ids)


@app.route('/api/note/<id>', methods=['PUT'])
@validate_required_fields(['title', 'subject'])
@api_response
def update_note_route(id: str) -> dict:
    """更新指定ID的笔记"""
    title = request.form.get('title', '').strip()
    subject = request.form.get('subject', '').strip()
    content = request.form.get('content', '').strip()

    existing_images = json.loads(request.form.get('existing_images', '[]'))
    images = request.files.getlist('images')
    safe_title = re.sub(r'[\\/:*?"<>|]', '_', title.strip())[:30] or f"note_{int(time.time())}"
    saved_images = existing_images + save_images(images, safe_title)
    
    old_note_result = fetch_notes_by_ids([id])
    if old_note_result['status'] == 'success' and old_note_result.get('notes'):
        for img in old_note_result['notes'][0].get('imgs', []):
            if img not in saved_images:
                img_path = os.path.join(ASSETS_FOLDER, img)
                if os.path.exists(img_path):
                    os.remove(img_path)
    
    return update_note(id, title, subject, content, saved_images)


@app.route('/api/ai', methods=['POST'])
@sse_stream
def ai_chat_stream_route() -> Any:
    """与AI进行流式对话（SSE）"""
    messages = request.json.get('messages', [])
    if not messages:
        return jsonify({'status': 'error', 'message': '请输入问题'}), 400
    yield from ai_chat(client, model_name, messages)


# ========== AI 对话记录 CRUD ==========
@app.route('/api/ai/chat', methods=['GET'])
@api_response
def get_ai_chat_route() -> dict:
    """获取对话记录"""
    return fetch_ai_chat()


@app.route('/api/ai/chat', methods=['POST'])
@api_response
def post_ai_chat_route() -> dict:
    """保存对话记录（完整覆盖）"""
    messages = request.json.get('messages', [])
    return save_ai_chat(messages)


@app.route('/api/ai/chat', methods=['DELETE'])
@api_response
def del_ai_chat_route() -> dict:
    """清空对话记录"""
    return delete_ai_chat()


# ========== AI 复习题生成与批改 ==========
@app.route('/api/ai/quiz', methods=['POST'])
@sse_stream
def ai_quiz_route() -> Any:
    """根据笔记内容流式生成练习题（SSE）"""
    note_content = request.json.get('note_content', '')
    if not note_content.strip():
        return jsonify({'status': 'error', 'message': '笔记内容不能为空'}), 400
    yield from generate_quiz(client, model_name, note_content)


@app.route('/api/ai/grade', methods=['POST'])
@sse_stream
def ai_grade_route() -> Any:
    """根据笔记内容和用户答案流式批改（SSE）"""
    note_content = request.json.get('note_content', '')
    questions = request.json.get('questions', [])
    user_answers = request.json.get('user_answers', [])
    
    if not note_content.strip() or not questions:
        return jsonify({'status': 'error', 'message': '参数不完整'}), 400
    yield from grade_quiz(client, model_name, note_content, questions, user_answers)


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_static_route(path: str) -> Any:
    if path != "" and os.path.exists(os.path.join(DIST_FOLDER, path)):
        return send_from_directory(DIST_FOLDER, path)
    else:
        return send_from_directory(DIST_FOLDER, 'index.html')


if __name__ == '__main__':
    if getattr(sys, 'frozen', False):
        backend_port = int(os.getenv('BACKEND_PORT', 5000))
        app.run(host='0.0.0.0', port=backend_port)
    else:
        backend_port = int(os.getenv('BACKEND_PORT', 5000))
        app.run(host='0.0.0.0', port=backend_port, debug=True)
