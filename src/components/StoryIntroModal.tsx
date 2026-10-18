import React from 'react';
import { motion } from 'motion/react';
import { X, ScrollText } from 'lucide-react';
import { StoryChapterMeta } from '../types/game';
import { CN_NUMS } from '../data/story';

interface StoryIntroModalProps {
  chapter: StoryChapterMeta;
  onClose: () => void;
}

/**
 * 章前引子卷轴：进入新大章时的剧情演出（装裱立轴 + 卷首诗 + 引子）
 */
export const StoryIntroModal: React.FC<StoryIntroModalProps> = ({ chapter, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-strong/90 backdrop-blur-sm animate-fade-in font-sans">
      <motion.div
        initial={{ opacity: 0, y: 26, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="relative max-w-lg w-full max-h-[92vh] overflow-y-auto paper-scroll p-8 md:p-10 scroll-mount"
      >
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
      </motion.div>
    </div>
  );
};
