import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

/** 全局错误边界：渲染异常时给出优雅的恢复界面，而非白屏 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error?.message || '未知异常' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Ink & Steel] 渲染异常：', error, info.componentStack);
  }

  handleReset = () => {
    try {
      // 保留成长数据，仅清空可能损坏的战斗中间态
      localStorage.removeItem('ink_and_steel_battle_snapshot');
    } catch {}
    this.setState({ hasError: false, message: '' });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-stone-950 text-stone-100 flex items-center justify-center p-6 font-serif">
          <div className="max-w-md w-full p-8 bg-stone-900 border border-stone-800 rounded-3xl shadow-2xl text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mb-4">
              <span className="text-2xl">墨</span>
            </div>
            <h1 className="text-xl font-black tracking-widest mb-2">画卷暂损</h1>
            <p className="text-xs text-stone-400 leading-relaxed mb-1">
              战场渲染出现异常：{this.state.message}
            </p>
            <p className="text-[11px] text-stone-500 leading-relaxed mb-6">
              您的通关进度与灵玉均安全保存于本地。点击下方按钮重整山河。
            </p>
            <button
              onClick={this.handleReset}
              className="py-3 px-7 bg-amber-200 hover:bg-amber-100 text-stone-950 font-bold text-sm rounded-xl transition-all cursor-pointer active:scale-95"
            >
              重整山河
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
