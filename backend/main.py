import os
import sys
import base64
import webbrowser
import threading
import webview
from flask import Flask
from flask_cors import CORS
from backend_tools import init_database


class Api:
    def download(self, filename: str, data: str) -> bool:
        import tkinter as tk
        from tkinter import filedialog
        try:
            root = tk.Tk()
            root.withdraw()
            path = filedialog.asksaveasfilename(
                defaultextension=".zip",
                filetypes=[("ZIP files", "*.zip")],
                initialfile=filename
            )
            root.destroy()
            if not path:
                return False
            with open(path, 'wb') as f:
                f.write(base64.b64decode(data))
            return True
        except Exception:
            return False

init_database()

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

from backend import register_routes
register_routes(app)


def start_flask(host='127.0.0.1', port=5000, debug=False):
    app.run(host=host, port=port, debug=debug, use_reloader=False)


if __name__ == '__main__':
    is_frozen = getattr(sys, 'frozen', False)

    flask_thread = threading.Thread(
        target=start_flask,
        args=('127.0.0.1', 5000, not is_frozen),
        daemon=True
    )
    flask_thread.start()

    if is_frozen:
        window = webview.create_window(
            title='Notes - 智能笔记应用',
            url='http://127.0.0.1:5000',
            width=1200,
            height=800,
            resizable=True,
            min_size=(800, 600),
            js_api=Api(),
        )
        webview.start(private_mode=False)
    else:
        # 开发模式：Flask 运行在后台，打开 Vite 开发服务器
        threading.Timer(1.0, lambda: webbrowser.open('http://localhost:5173')).start()
        print('开发模式启动成功！')
        print(f'  Flask API:  http://127.0.0.1:5000')
        print(f'  前端地址:   http://localhost:5173')
        flask_thread.join()
