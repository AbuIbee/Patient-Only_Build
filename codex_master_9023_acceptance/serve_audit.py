"""Loopback-only static optimized build + fixed local API reverse proxy."""
import http.server, http.client, pathlib, threading, urllib.parse

ROOT=pathlib.Path(__file__).resolve().parent/'optimized-build'

class Api(http.server.BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_OPTIONS(self):
        self.send_response(204);self.cors();self.end_headers()
    def cors(self):
        self.send_header('Access-Control-Allow-Origin','http://127.0.0.1:5187')
        self.send_header('Access-Control-Allow-Headers','authorization,apikey,content-type,x-client-info,prefer,range,accept-profile,content-profile')
        self.send_header('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD')
        self.send_header('Access-Control-Expose-Headers','Content-Range')
    def proxy(self):
        if self.path.startswith('/auth/v1/'):
            port=55441;path=self.path[len('/auth/v1'):]
        elif self.path.startswith('/rest/v1/'):
            port=55442;path=self.path[len('/rest/v1'):]
        else:
            self.send_response(501);self.cors();self.end_headers();return
        headers={k:v for k,v in self.headers.items() if k.lower() not in ('host','connection','origin')}
        body=self.rfile.read(int(self.headers.get('Content-Length','0')))
        conn=http.client.HTTPConnection('127.0.0.1',port,timeout=30)
        try:
            conn.request(self.command,path,body=body or None,headers=headers);r=conn.getresponse();data=r.read()
            self.send_response(r.status)
            for k,v in r.getheaders():
                if k.lower() not in ('transfer-encoding','content-length','connection','access-control-allow-origin'):self.send_header(k,v)
            self.cors();self.send_header('Content-Length',str(len(data)));self.end_headers()
            if self.command!='HEAD':self.wfile.write(data)
        finally:conn.close()
    do_GET=do_POST=do_PUT=do_PATCH=do_DELETE=do_HEAD=proxy

class Static(http.server.SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT),**kwargs)
    def log_message(self,*args):pass
    def do_GET(self):
        if not pathlib.Path(self.translate_path(self.path)).is_file() and '.' not in pathlib.Path(urllib.parse.urlparse(self.path).path).name:self.path='/index.html'
        super().do_GET()

threading.Thread(target=http.server.ThreadingHTTPServer(('127.0.0.1',55440),Api).serve_forever,daemon=True).start()
print('Audit build 127.0.0.1:5187; fixed Auth/REST proxy 127.0.0.1:55440',flush=True)
http.server.ThreadingHTTPServer(('127.0.0.1',5187),Static).serve_forever()
