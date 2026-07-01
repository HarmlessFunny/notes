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
from backend_tools import init_database, fetch_all_notes, fetch_notes_by_day, search_notes, fetch_notes_by_titles, add_note, update_note, delete_notes, save_images, fetch_ai_chat, save_ai_chat, delete_ai_chat, Note, ASSETS_FOLDER, DIST_FOLDER, APP_DIR, validate_title
from backend_utils import api_response, validate_required_fields, handle_api_error, sse_stream
from dotenv import load_dotenv


# 加载环境变量
if getattr(sys, 'frozen', False):
    load_dotenv(os.path.join(APP_DIR, '.env'))
else:
    load_dotenv(os.path.join(APP_DIR, '..', '.env'))

init_database()

api_key = os.getenv("API_KEY")
base_url = os.getenv("BASE_URL")
model_name = os.getenv("MODEL_NAME")
reasoning_effort = os.getenv("REASONING_EFFORT") or None
AI_AVAILABLE = bool(api_key and base_url and model_name)

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

client = OpenAI(api_key=api_key, base_url=base_url) if AI_AVAILABLE else None

# ========== 笔记路由 ==========

@app.route('/api/notes/<someday>', methods=['GET'])
@api_response
def get_notes_by_day_route(someday: str) -> dict:
    return fetch_notes_by_day(someday)


@app.route('/api/notes', methods=['GET'])
@api_response
def get_all_notes_route() -> dict:
    return fetch_all_notes()


@app.route('/api/note/<title>', methods=['GET'])
@api_response
def get_note_by_title_route(title: str) -> dict:
    """根据标题获取笔记详情"""
    result = fetch_notes_by_titles([title])
    if result['status'] == 'success' and result.get('notes'):
        return {'status': 'success', 'note': result['notes'][0]}
    else:
        return {'status': 'error', 'message': '笔记不存在'}


@app.route('/api/notes/search', methods=['GET'])
@api_response
def search_notes_route() -> dict:
    keyword = request.args.get('q', '').strip()
    return search_notes(keyword)


@app.route('/api/notes/batch', methods=['POST'])
@api_response
def batch_notes_route() -> dict:
    """根据标题列表批量获取笔记"""
    titles = request.json.get('titles', [])
    return fetch_notes_by_titles(titles)


@app.route('/assets/<filename>', methods=['GET'])
def serve_image_route(filename: str) -> Tuple[Any, int]:
    user_path = os.path.join(ASSETS_FOLDER, filename)
    if os.path.exists(user_path):
        return send_file(user_path), 200
    dist_path = os.path.join(DIST_FOLDER, 'assets', filename)
    if os.path.exists(dist_path):
        return send_file(dist_path), 200
    return jsonify({'status': 'error', 'message': '图片不存在', 'path': user_path}), 404


@app.route('/api/submit', methods=['POST'])
@validate_required_fields(['title', 'subject'])
@api_response
def submit_note_route() -> dict:
    """创建笔记"""
    title = request.form.get('title', '').strip()
    subject = request.form.get('subject', '').strip()
    timestamp = request.form.get('timestamp', '').strip() or str(int(time.time() * 1000))
    content = request.form.get('content', '').strip()

    images = request.files.getlist('images')
    safe_title = re.sub(r'[\\/:*?"<>|]', '_', title)[:30] or f"note_{int(time.time())}"
    saved_images = save_images(images, safe_title)

    result = add_note(title, subject, content, timestamp, saved_images)
    if result['status'] == 'error':
        # 创建失败时清理已上传的图片
        for img in saved_images:
            img_path = os.path.join(ASSETS_FOLDER, img)
            if os.path.exists(img_path):
                os.remove(img_path)
        return result, 400

    return {
        'status': 'success',
        'message': '笔记发布成功',
        'data': {'title': title, 'subject': subject, 'time': timestamp, 'imgs': saved_images}
    }


@app.route('/api/notes/delete', methods=['DELETE'])
@api_response
def delete_selected_notes_route() -> dict:
    """根据标题列表批量删除笔记"""
    titles = request.json.get('titles', [])
    if not titles:
        return {'status': 'error', 'message': '请选择要删除的笔记'}
    return delete_notes(titles)


@app.route('/api/note/<title>', methods=['PUT'])
@validate_required_fields(['title', 'subject'])
@api_response
def update_note_route(title: str) -> dict:
    """更新笔记（title 路径参数为旧标题，表单中的 title 为新标题）"""
    new_title = request.form.get('title', '').strip()
    subject = request.form.get('subject', '').strip()
    content = request.form.get('content', '').strip()

    existing_images = json.loads(request.form.get('existing_images', '[]'))
    images = request.files.getlist('images')
    safe_title = re.sub(r'[\\/:*?"<>|]', '_', new_title)[:30] or f"note_{int(time.time())}"
    saved_images = existing_images + save_images(images, safe_title)

    # 先记录旧图片（用于更新成功后清理），必须在 update_note 之前获取
    old_note_result = fetch_notes_by_titles([title])
    old_imgs = []
    if old_note_result['status'] == 'success' and old_note_result.get('notes'):
        old_imgs = old_note_result['notes'][0].get('imgs', [])

    result = update_note(title, new_title, subject, content, saved_images)
    if result['status'] == 'error':
        return result, 400

    # 数据库更新成功后，删除被移除的旧图片
    for img in old_imgs:
        if img not in saved_images:
            img_path = os.path.join(ASSETS_FOLDER, img)
            if os.path.exists(img_path):
                os.remove(img_path)

    return result


# ========== AI 路由 ==========

@app.route('/api/ai/status', methods=['GET'])
@api_response
def ai_status_route() -> dict:
    return {'status': 'success', 'ai_available': AI_AVAILABLE}


@app.route('/api/ai', methods=['POST'])
@sse_stream
def ai_chat_stream_route() -> Any:
    if not AI_AVAILABLE:
        yield {'type': 'error', 'content': 'AI 功能未配置，请在 .env 中设置 API_KEY / BASE_URL / MODEL_NAME'}
        return
    messages = request.json.get('messages', [])
    if not messages:
        yield {'type': 'error', 'content': '请输入问题'}
        return
    yield from ai_chat(client, model_name, messages, reasoning_effort)


@app.route('/api/ai/chat', methods=['GET'])
@api_response
def get_ai_chat_route() -> dict:
    return fetch_ai_chat()


@app.route('/api/ai/chat', methods=['POST'])
@api_response
def post_ai_chat_route() -> dict:
    messages = request.json.get('messages', [])
    return save_ai_chat(messages)


@app.route('/api/ai/chat', methods=['DELETE'])
@api_response
def del_ai_chat_route() -> dict:
    return delete_ai_chat()


@app.route('/api/ai/quiz', methods=['POST'])
@sse_stream
def ai_quiz_route() -> Any:
    if not AI_AVAILABLE:
        yield {'type': 'error', 'content': 'AI 功能未配置'}
        return
    note_content = request.json.get('note_content', '')
    if not note_content.strip():
        yield {'type': 'error', 'content': '笔记内容不能为空'}
        return
    yield from generate_quiz(client, model_name, note_content, reasoning_effort)


@app.route('/api/ai/grade', methods=['POST'])
@sse_stream
def ai_grade_route() -> Any:
    if not AI_AVAILABLE:
        yield {'type': 'error', 'content': 'AI 功能未配置'}
        return
    note_content = request.json.get('note_content', '')
    questions = request.json.get('questions', [])
    user_answers = request.json.get('user_answers', [])
    if not note_content.strip() or not questions:
        yield {'type': 'error', 'content': '参数不完整'}
        return
    yield from grade_quiz(client, model_name, note_content, questions, user_answers, reasoning_effort)


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
