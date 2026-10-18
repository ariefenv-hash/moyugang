import os, sys

# 守护化启动 vite dev server：脱离工具会话的进程组/会话，挂父到 init
if os.fork() > 0:
    os._exit(0)
os.setsid()
if os.fork() > 0:
    os._exit(0)

devnull = os.open(os.devnull, os.O_RDWR)
os.dup2(devnull, 0)
log = os.open('/home/z/my-project/vite-dev.log', os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o644)
os.dup2(log, 1); os.dup2(log, 2)

os.chdir('/home/z/my-project')
# 直接 exec vite，避免 npm 中间层
os.execvp('node', ['node', 'node_modules/.bin/vite', '--port=3000', '--host=0.0.0.0'])
