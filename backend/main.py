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
        import ctypes
        from ctypes import wintypes
        try:
            MAX_PATH = 260
            buf = ctypes.create_unicode_buffer(MAX_PATH)
            buf.value = filename

            class OPENFILENAMEW(ctypes.Structure):
                _fields_ = [
                    ("lStructSize", wintypes.DWORD),
                    ("hwndOwner", wintypes.HWND),
                    ("hInstance", wintypes.HINSTANCE),
                    ("lpstrFilter", wintypes.LPCWSTR),
                    ("lpstrCustomFilter", wintypes.LPWSTR),
                    ("nMaxCustFilter", wintypes.DWORD),
                    ("nFilterIndex", wintypes.DWORD),
                    ("lpstrFile", wintypes.LPWSTR),
                    ("nMaxFile", wintypes.DWORD),
                    ("lpstrFileTitle", wintypes.LPWSTR),
                    ("nMaxFileTitle", wintypes.DWORD),
                    ("lpstrInitialDir", wintypes.LPCWSTR),
                    ("lpstrTitle", wintypes.LPCWSTR),
                    ("Flags", wintypes.DWORD),
                    ("nFileOffset", wintypes.WORD),
                    ("nFileExtension", wintypes.WORD),
                    ("lpstrDefExt", wintypes.LPCWSTR),
                    ("lCustData", wintypes.LPARAM),
                    ("lpfnHook", ctypes.c_void_p),
                    ("lpTemplateName", wintypes.LPCWSTR),
                    ("pvReserved", ctypes.c_void_p),
                    ("dwReserved", wintypes.DWORD),
                    ("flagsEx", wintypes.DWORD),
                ]

            ofn = OPENFILENAMEW()
            ofn.lStructSize = ctypes.sizeof(OPENFILENAMEW)
            ofn.lpstrFile = buf
            ofn.nMaxFile = MAX_PATH
            ofn.lpstrFilter = "ZIP Files\0*.zip\0\0"
            ofn.nFilterIndex = 1
            ofn.lpstrTitle = "Save As"
            ofn.Flags = 0x00000002 | 0x00000800
            ofn.lpstrDefExt = "zip"

            if ctypes.windll.comdlg32.GetSaveFileNameW(ctypes.byref(ofn)):
                path = buf.value
                with open(path, 'wb') as f:
                    f.write(base64.b64decode(data))
                return True
            return False
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
