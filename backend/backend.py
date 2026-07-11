import os
import json
import time
import re
from flask import request, jsonify, send_from_directory, send_file
from typing import Tuple, Any
from backend_tools import fetch_all_notes, fetch_notes_by_day, search_notes, fetch_notes_by_titles, add_note, update_note, delete_notes, save_images, fetch_ai_chat, save_ai_chat, delete_ai_chat, Note, UPLOADS_FOLDER, DIST_FOLDER, APP_DIR, validate_title
from backend_utils import api_response, validate_required_fields, handle_api_error, sse_stream


def get_ai_config_from_headers() -> dict:
    return {
        'api_key': request.headers.get('X-Chat-Api-Key', ''),
        'base_url': request.headers.get('X-Chat-Base-Url', ''),
        'model_name': request.headers.get('X-Chat-Model-Name', ''),
        'vision_enabled': request.headers.get('X-Vision-Enabled', 'true').lower() not in ('false', '0', 'no'),
    }


def register_routes(app):
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
        titles = request.json.get('titles', [])
        return fetch_notes_by_titles(titles)

    @app.route('/uploads/images/<filename>', methods=['GET'])
    def serve_image_route(filename: str) -> Tuple[Any, int]:
        user_path = os.path.join(UPLOADS_FOLDER, filename)
        if os.path.exists(user_path):
            return send_file(user_path), 200
        dist_path = os.path.join(DIST_FOLDER, 'uploads', 'images', filename)
        if os.path.exists(dist_path):
            return send_file(dist_path), 200
        return jsonify({'status': 'error', 'message': '图片不存在', 'path': user_path}), 404

    @app.route('/api/submit', methods=['POST'])
    @validate_required_fields(['title', 'subject'])
    @api_response
    def submit_note_route() -> dict:
        title = request.form.get('title', '').strip()
        subject = request.form.get('subject', '').strip()
        timestamp = request.form.get('timestamp', '').strip() or str(int(time.time() * 1000))
        content = request.form.get('content', '').strip()

        images = request.files.getlist('images')
        safe_title = re.sub(r'[\\/:*?"<>|]', '_', title)[:30] or f"note_{int(time.time())}"
        saved_images = save_images(images, safe_title)

        result = add_note(title, subject, content, timestamp, saved_images)
        if result['status'] == 'error':
            for img in saved_images:
                img_path = os.path.join(UPLOADS_FOLDER, img)
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
        titles = request.json.get('titles', [])
        if not titles:
            return {'status': 'error', 'message': '请选择要删除的笔记'}
        return delete_notes(titles)

    @app.route('/api/note/<title>', methods=['PUT'])
    @validate_required_fields(['title', 'subject'])
    @api_response
    def update_note_route(title: str) -> dict:
        new_title = request.form.get('title', '').strip()
        subject = request.form.get('subject', '').strip()
        content = request.form.get('content', '').strip()

        existing_images = json.loads(request.form.get('existing_images', '[]'))
        images = request.files.getlist('images')
        safe_title = re.sub(r'[\\/:*?"<>|]', '_', new_title)[:30] or f"note_{int(time.time())}"
        saved_images = existing_images + save_images(images, safe_title)

        old_note_result = fetch_notes_by_titles([title])
        old_imgs = []
        if old_note_result['status'] == 'success' and old_note_result.get('notes'):
            old_imgs = old_note_result['notes'][0].get('imgs', [])

        result = update_note(title, new_title, subject, content, saved_images)
        if result['status'] == 'error':
            return result, 400

        for img in old_imgs:
            if img not in saved_images:
                img_path = os.path.join(UPLOADS_FOLDER, img)
                if os.path.exists(img_path):
                    os.remove(img_path)

        return result

    @app.route('/api/ai/upload', methods=['POST'])
    @api_response
    def upload_ai_image_route() -> dict:
        images = request.files.getlist('images')
        if not images:
            return {'status': 'error', 'message': '请选择图片'}
        saved = save_images(images, f"ai_{int(time.time())}")
        urls = [f'/uploads/images/{f}' for f in saved]
        return {'status': 'success', 'urls': urls}

    @app.route('/api/ai/status', methods=['GET'])
    @api_response
    def ai_status_route() -> dict:
        config = get_ai_config_from_headers()
        available = bool(config['api_key'] and config['base_url'] and config['model_name'])
        return {'status': 'success', 'ai_available': available, 'vision_enabled': config['vision_enabled']}

    @app.route('/api/ai', methods=['POST'])
    @sse_stream
    def ai_chat_stream_route() -> Any:
        from openai import OpenAI
        from backend_ai import ai_chat
        config = get_ai_config_from_headers()
        if not config['api_key'] or not config['base_url'] or not config['model_name']:
            yield {'type': 'error', 'content': 'AI 功能未配置，请先设置 API 配置'}
            return
        client = OpenAI(api_key=config['api_key'], base_url=config['base_url'])
        messages = request.json.get('messages', [])
        if not messages:
            yield {'type': 'error', 'content': '请输入问题'}
            return
        yield from ai_chat(client, config['model_name'], messages)

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

    @app.route('/api/export', methods=['GET'])
    def export_notes_route():
        import io, zipfile
        titles = request.args.getlist('titles')
        if not titles:
            return jsonify({'status': 'error', 'message': '请选择要导出的笔记'}), 400

        result = fetch_notes_by_titles(titles)
        if result['status'] != 'success' or not result.get('notes'):
            return jsonify({'status': 'error', 'message': '笔记不存在'}), 404

        notes = result['notes']
        multiple = len(notes) > 1
        label = 'notes' if multiple else re.sub(r'[\\/:*?"<>|]', '_', notes[0]['title'])[:50]
        buf = io.BytesIO()

        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
            for note in notes:
                safe_name = re.sub(r'[\\/:*?"<>|]', '_', note['title'])[:30] or 'note'
                lines = [note.get('content', '')]
                for img in note.get('imgs', []):
                    unique_name = f'{safe_name}_{img}' if multiple else img
                    lines.append(f'\n![{img}](images/{unique_name})')
                    img_path = os.path.join(UPLOADS_FOLDER, img)
                    if os.path.exists(img_path):
                        zf.write(img_path, f'images/{unique_name}')
                zf.writestr(f'{safe_name}.md', '\n'.join(lines))

        buf.seek(0)
        return send_file(buf, mimetype='application/zip', as_attachment=True, download_name=f'{label}.zip')

    @app.route('/', defaults={'path': ''})
    @app.route('/<path:path>')
    def serve_static_route(path: str) -> Any:
        if path != "" and os.path.exists(os.path.join(DIST_FOLDER, path)):
            return send_from_directory(DIST_FOLDER, path)
        else:
            return send_from_directory(DIST_FOLDER, 'index.html')
