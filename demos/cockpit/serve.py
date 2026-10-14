"""Local-only demo server; reuse previously acquired vehicle assets."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
import argparse

root = Path(__file__).resolve().parent
parser = argparse.ArgumentParser()
parser.add_argument('--port', type=int, default=8768)
parser.add_argument('--assets', type=Path, default=root.parents[2] / 'outputs' / 'lynk06_car_demo')
args = parser.parse_args()
asset_root = args.assets.resolve()

class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        relative = unquote(urlsplit(path).path).lstrip('/') or 'cockpit.html'
        local = (root / relative).resolve()
        base = root if local.is_relative_to(root) and local.is_file() else (
            asset_root if relative.startswith(('assets/', 'vendor/', 'references/relive/')) else root)
        target = (base / relative).resolve()
        if not target.is_relative_to(base):
            return str(root / '__not_found__')
        return str(target)

if __name__ == '__main__':
    print(f'Preview: http://127.0.0.1:{args.port}/cockpit.html')
    ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()
