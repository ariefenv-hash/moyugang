import React from 'react';
import { X, Shield, Sparkles, Move, Flame, Gem } from 'lucide-react';

interface LoreModalProps {
  onClose: () => void;
}

/** 兵法心诀：装裱立轴式卷宗 */
export const LoreModal: React.FC<LoreModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-strong/85 backdrop-blur-sm animate-fade-in font-sans">
      <div className="max-w-2xl w-full max-h-[85vh] overflow-y-auto paper-scroll p-6 md:p-8 scroll-mount flex flex-col justify-between text-ink">
        <div>
          <div className="flex items-center justify-between pb-4 border-b rule-zhusi mb-6">
            <div>
              <h2 className="text-xl font-serif font-black tracking-widest text-ink-strong">
                风雅卷宗 · 2.5D 水墨兵法心诀
              </h2>
              <p className="text-xs text-ink-mid font-serif mt-1 tracking-wider">
                骨骼动画演武、2.5D 深度战道与书法连击评级秘要
              </p>
            </div>
            <button
              onClick={onClose}
              className="btn-ink p-2 cursor-pointer"
              aria-label="关闭"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-5 text-xs text-ink leading-relaxed">
            {/* 2.5D and Skeletal Innovation Highlights */}
            <div className="p-4 panel-paper">
              <h3 className="text-sm font-serif font-bold text-daiqing mb-2 flex items-center gap-1.5">
                <Move className="w-4 h-4" />
                2.5D 战场深度与多关节骨骼动画
              </h3>
              <p className="text-ink-mid">
                突破传统平移束缚，引入 2.5D 走道纵深与真实多关节火柴人骨骼物理：
              </p>
              <ul className="mt-2 space-y-1.5 list-disc list-inside text-ink-mid">
                <li><strong className="text-ink-strong">三式操控任选：</strong>「挥毫」（全屏手势）、「双区」（触屏推荐：左手浮动摇杆移动，右手点按/手势/技能键）与「经典」（固定摇杆+按键）三种模式，顶栏一键切换且自动记忆。</li>
                <li><strong className="text-ink-strong">2.5D 自由漫步：</strong>支持 WASD / 虚拟摇杆上下走道穿行，利用纵深走位闪避箭矢与敌方冲锋。</li>
                <li><strong className="text-ink-strong">轻功腾跃与凌空斩 (Space)：</strong>起跳后在空中施展落墨凌空斩，如鹰击长空般俯冲大地，引爆范围地震波！</li>
                <li><strong className="text-ink-strong">多关节骨骼与飘逸绸带：</strong>头颈、脊椎、双节手足与多节点物理披风随风飘拂，受击顿挫回弹感十足。</li>
              </ul>
            </div>

            {/* Combat Feedback & Calligraphy Combos */}
            <div className="p-4 panel-paper">
              <h3 className="text-sm font-serif font-bold text-zheshi mb-2 flex items-center gap-1.5">
                <Flame className="w-4 h-4" />
                水墨打击音效、顿挫感与书法连击评级
              </h3>
              <p className="text-ink-mid">
                真实水墨交融打击反馈与文墨连击机制：
              </p>
              <ul className="mt-2 space-y-1.5 list-disc list-inside text-ink-mid">
                <li><strong className="text-ink-strong">水墨破裂打击音：</strong>重击融入饱蘸浓墨的爆浆感与刀剑清脆撞击，顿挫微停（Hit Stop）带来厚实打击质感。</li>
                <li><strong className="text-ink-strong">六重书法连击评级：</strong>从「初窥门径」到「行云流水」、「笔走龙蛇」直至「翰墨通神」，连击越高，全军墨韵流转与攻速加成越强！</li>
                <li><strong className="text-ink-strong">朱红书法印章暴击：</strong>暴击时于战场实时刻印「斩」、「断」、「阵」、「绝」等朱砂印章！</li>
              </ul>
            </div>

            {/* Unique Creative Skill Mechanisms */}
            <div className="p-4 panel-paper">
              <h3 className="text-sm font-serif font-bold text-qingjin mb-2 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                新增阵法机制：墨池灵阵 (T) 与天地异象
              </h3>
              <ul className="mt-2 space-y-1.5 list-disc list-inside text-ink-mid">
                <li><strong className="text-ink-strong">墨荷灵阵 (T / 触控按键)：</strong>在战地上布下流墨莲花。敌军踏入则受重力粘稠减速并受墨蚀侵袭；友军触碰则绽放净化水墨，恢复大量生命值！</li>
                <li><strong className="text-ink-strong">战场天地异象：</strong>战斗中随机降临「天降墨雨（三倍墨韵）」、「清风徐来（全军迅行）」或「残月生辉（暴击狂飙）」。</li>
              </ul>
            </div>

            {/* Army Commands */}
            <div className="p-4 panel-paper">
              <h3 className="text-sm font-serif font-bold text-shilv mb-2 flex items-center gap-1.5">
                <Shield className="w-4 h-4" />
                四大军阵指令
              </h3>
              <div className="grid grid-cols-2 gap-2 mt-2 text-ink-mid">
                <div className="p-2 panel-paper-deep">
                  <span className="text-ink-strong font-semibold">【坚守墨阁】(1)：</span>全军撤回墨阁。
                </div>
                <div className="p-2 panel-paper-deep">
                  <span className="text-ink-strong font-semibold">【就地御敌】(2)：</span>原地防线阻截。
                </div>
                <div className="p-2 panel-paper-deep">
                  <span className="text-daiqing font-semibold">【随君冲锋】(3)：</span>全军集结主角阵眼！
                </div>
                <div className="p-2 panel-paper-deep">
                  <span className="text-zheshi font-semibold">【全军破阵】(4)：</span>大军强攻敌中枢。
                </div>
              </div>
            </div>

            {/* Endless mode & Pause & Stars */}
            <div className="p-4 panel-paper">
              <h3 className="text-sm font-serif font-bold text-ink-strong mb-2 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                新卷机制：无尽试炼、暂停与星级评价
              </h3>
              <ul className="mt-2 space-y-1.5 list-disc list-inside text-ink-mid">
                <li>
                  <strong className="text-ink-strong">无尽试炼：</strong>
                  通关第五折后解锁。墨潮无限且逐波变强，每五波玄墨霸主压阵；坚守波次越多，灵玉越丰，历史最佳波次将被铭记！
                </li>
                <li>
                  <strong className="text-ink-strong">星级评价：</strong>
                  通关时墨阁血量余七成以上得三星，三成五以上两星，其余一星。重复挑战可刷新最高星级！
                </li>
                <li>
                  <strong className="text-ink-strong">战局暂停：</strong>
                  战斗中按 ESC / P（或点顶栏暂停键）随时暂停，重开、调音、撤离皆可。
                </li>
                <li>
                  <strong className="text-ink-strong">首领二阶段：</strong>
                  首领血量跌破五成将进入「暗墨狂姿」——攻速移速大增、气势全开，务必留绝技应对！
                </li>
              </ul>
            </div>

            {/* 墨灵祝福 / 文房四宝 / 墨龙卷 / 墨滞时刻 */}
            <div className="p-4 panel-paper">
              <h3 className="text-sm font-serif font-bold text-cinnabar mb-2 flex items-center gap-1.5">
                <Gem className="w-4 h-4" />
                趣味机制：墨灵祝福 · 文房四宝 · 墨龙卷 · 墨滞时刻
              </h3>
              <ul className="mt-2 space-y-1.5 list-disc list-inside text-ink-mid">
                <li>
                  <strong className="text-ink-strong">墨灵祝福（三选一）：</strong>
                  普通关卡每约 55 秒、无尽试炼每两波，战场凝滞片刻，墨灵呈上三道祝福供君抉择——剑气纵横、疾风诗步、墨甲如山、点墨成金、连墨永驻、文光护阁、笔势如虹、星辉汲取，可叠加愈战愈强！
                </li>
                <li>
                  <strong className="text-ink-strong">文房四宝：</strong>
                  击杀敌军有几率掉落「笔 / 墨 / 纸 / 砚」宝物，剑仙拾取后集齐四宝即引「文光焕彩」：绝意瞬间充满、全军治愈三成五、墨韵大增！
                </li>
                <li>
                  <strong className="text-ink-strong">墨龙卷：</strong>
                  连墨达「翰墨通神」（45 连）时自动召唤墨龙横扫战场，沿途敌军尽数重创击飞——高连击的最佳犒赏！
                </li>
                <li>
                  <strong className="text-ink-strong">墨滞时刻：</strong>
                  剑仙气血首次跌破三成，天地凝墨入子弹时间，万物迟缓而剑仙独醒，给尔翻盘喘息（每场一次）。
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t rule-ink mt-6">
          <button
            onClick={onClose}
            className="btn-seal w-full py-3 px-4 text-xs font-serif font-bold tracking-widest cursor-pointer"
          >
            心领神会，入阵试炼
          </button>
        </div>
      </div>
    </div>
  );
};
