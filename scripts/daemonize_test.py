import os, sys, time

# 经典 double-fork 守护化：脱离会话/进程组，父进程挂到 init (tini)
if os.fork() > 0:
    os._exit(0)
os.setsid()
if os.fork() > 0:
    os._exit(0)

# 重定向标准流，彻底脱离 TTY
sys.stdout.flush(); sys.stderr.flush()
devnull = os.open(os.devnull, os.O_RDWR)
os.dup2(devnull, 0); os.dup2(devnull, 1); os.dup2(devnull, 2)

marker = '/home/z/my-project/daemon_test.marker'
with open(marker, 'w') as f:
    f.write(str(os.getpid()))

# 存活测试：每秒写心跳，共 120 秒
start = time.time()
while time.time() - start < 120:
    with open(marker, 'a') as f:
        f.write(f"\nalive at {time.strftime('%H:%M:%S')}")
    time.sleep(1)
