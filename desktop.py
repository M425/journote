from threading import Thread

import webview
from werkzeug.serving import make_server

from app import app


def main():
    server = make_server("127.0.0.1", 0, app, threaded=True)
    server_thread = Thread(target=server.serve_forever, daemon=True)
    server_thread.start()

    try:
        webview.create_window(
            "Journote",
            f"http://127.0.0.1:{server.server_port}/",
            width=1280,
            height=820,
            min_size=(800, 600),
        )
        webview.start(debug=False)
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()