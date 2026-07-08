import os
import sys
import webbrowser
import threading
from flask import Flask
from flask_cors import CORS
from backend_tools import init_database

init_database()

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

from backend import register_routes
register_routes(app)


def start_flask(host='127.0.0.1', port=5000, debug=False):
    """启动 Flask 服务器（供 Android / PyInstaller / 开发环境调用）"""
    app.run(host=host, port=port, debug=debug, use_reloader=False)


if __name__ == '__main__':
    if getattr(sys, 'frozen', False):
        for port in range(5000, 5100):
            try:
                threading.Timer(1.0, lambda p=port: webbrowser.open(f'http://localhost:{p}')).start()
                start_flask(host='0.0.0.0', port=port, debug=False)
            except OSError:
                continue
            break
    else:
        start_flask(host='0.0.0.0', port=5000, debug=True)
