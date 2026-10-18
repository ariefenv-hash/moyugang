import os

# 守护化启动 vite preview（生产构建预览）：脱离工具会话进程组，挂父到 init
if os.fork() > 0:
    os._exit(0)
os.setsid()
if os.fork() > 0:
    os._exit(0)

devnull = os.open(os.devnull, os.O_RDWR)
os.dup2(devnull, 0)
log = os.open('/home/z/my-project/vite-preview.log', os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o644)
os.dup2(log, 1); os.dup2(log, 2)

os.chdir('/home/z/my-project')
os.execvp('node', ['node', 'node_modules/.bin/vite', 'preview', '--port=4173', '--host=0.0.0.0'])
