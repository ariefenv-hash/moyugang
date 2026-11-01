import React from 'react';
import { motion } from 'motion/react';
import { X, ScrollText } from 'lucide-react';
import { StoryChapterMeta } from '../types/game';
import { CN_NUMS } from '../data/story';

interface StoryIntroModalProps {
  chapter: StoryChapterMeta;
  onClose: () => void;
}

/** 卷轴轴杆：深木色横杆 + 两端圆头轴头（天杆朝上、地杆朝下） */
const ScrollRod: React.FC<{ side: 'top' | 'bottom' }> = ({ side }) => (
  <div
    className="relative h-4 rounded-full shadow-lg"
    style={{
      background:
        'linear-gradient(180deg, #4a3626 0%, #2c1f14 45%, #1a1109 100%)',
      boxShadow:
        side === 'top'
          ? '0 2px 6px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.14)'
          : '0 -1px 5px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
    }}
    aria-hidden="true"
  >
    {/* 两端轴头 */}
    <span
      className="absolute -left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full"
      style={{ background: 'radial-gradient(circle at 35% 35%, #6b4e35, #241708)' }}
    />
    <span
      className="absolute -right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full"
      style={{ background: 'radial-gradient(circle at 35% 35%, #6b4e35, #241708)' }}
    />
  </div>
);

/**
 * 章前引子卷轴：进入新大章时的剧情演出。
 * 真卷轴展开演出：天杆静止、卷身自天杆向下徐徐展开（height 0→auto），
 * 地杆随卷身下缘自然下垂——复刻立轴开卷之式。
 */
export const StoryIntroModal: React.FC<StoryIntroModalProps> = ({ chapter, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-strong/90 backdrop-blur-sm animate-fade-in font-sans">
      <div className="relative max-w-lg w-full flex flex-col" style={{ maxHeight: '92vh' }}>
        {/* 天杆（静止） */}
        <ScrollRod side="top" />

        {/* 卷身：自天杆向下展开（受限高滚动） */}
        <motion.div
          initial={{ height: 0, opacity: 0.5 }}
          animate={{ height: 'auto', opacity: 1 }}
          transition={{ duration: 0.85, ease: [0.22, 0.9, 0.28, 1] }}
          className="overflow-y-auto paper-scroll scroll-mount relative min-h-0"
          style={{ maxHeight: 'calc(92vh - 2.5rem)' }}
        >
          {/* 卷身两侧压边阴影：卷筒质感 */}
          <div
            className="pointer-events-none absolute inset-y-0 left-0 w-3"
            style={{ background: 'linear-gradient(90deg, rgba(60,42,20,0.28), transparent)' }}
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute inset-y-0 right-0 w-3"
            style={{ background: 'linear-gradient(-90deg, rgba(60,42,20,0.28), transparent)' }}
            aria-hidden="true"
          />

          <div className="p-8 md:p-10">
            {/* 关闭 */}
            <button
              onClick={onClose}
              className="absolute top-3 right-3 p-1.5 text-ink-light hover:text-cinnabar transition-colors cursor-pointer"
              aria-label="关闭引子"
            >
              <X className="w-4 h-4" />
            </button>

            {/* 章序 */}
            <div className="flex items-center gap-2.5 text-xs text-ink-light tracking-widest font-serif mb-4">
              <span className="inline-block w-7 h-px bg-cinnabar/60" aria-hidden="true" />
              <span>第{CN_NUMS[chapter.id] ?? chapter.id}大章</span>
              <span aria-hidden="true" className="text-cinnabar/60">·</span>
              <span>章前引子</span>
            </div>

            {/* 章名 */}
            <h2 className="text-3xl font-serif font-black tracking-widest text-ink-strong leading-snug">
              《{chapter.anthology}
              <span aria-hidden="true" className="text-cinnabar mx-1">·</span>
              {chapter.name}》
            </h2>

            {/* 卷首诗 */}
            <div className="mt-5 pl-4 border-l-2 border-cinnabar/70">
              <p className="text-lg font-brush-xing text-ink leading-loose">{chapter.verse}</p>
              <p className="text-[11px] text-ink-light font-serif mt-1">{chapter.verseAuthor}</p>
            </div>

            {/* 引子正文 */}
            <div className="mt-6 space-y-3">
              <p className="flex items-center gap-1.5 text-[11px] font-serif font-bold text-cinnabar tracking-widest">
                <ScrollText className="w-3.5 h-3.5" />
                卷宗 · 引子
              </p>
              <p className="text-sm text-ink-mid font-serif leading-loose text-justify">
                {chapter.intro}
              </p>
            </div>

            {/* 尾注 */}
            <p className="mt-6 text-[11px] text-ink-light font-serif leading-relaxed border-t rule-ink pt-4">
              每破一折，文脉便复一分；守墨阁越完好，文心越盛。折页之间，山河自会讲述余下的故事。
            </p>

            {/* 启程 */}
            <div className="mt-7 flex justify-center">
              <button
                onClick={onClose}
                className="btn-seal py-3 px-10 font-serif font-bold text-sm tracking-[0.3em] cursor-pointer"
              >
                启 卷
              </button>
            </div>
          </div>
        </motion.div>

        {/* 地杆（随卷身下缘自然下垂） */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55, duration: 0.35 }}
        >
          <ScrollRod side="bottom" />
        </motion.div>
      </div>
    </div>
  );
};
