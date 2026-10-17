#!/usr/bin/env python3
"""霞鹜文楷子集化：扫描项目源码字符集 → pyftsubset 生成 woff2

修复记录：
- 路径改为仓库相对（基于 __file__ 定位），不再硬编码 /home/z/my-project，
  避免换目录后扫不到源码 → 子集停留在旧字符清单 → 新文案缺字回退系统字体
- 扫描范围增加 *.css；输出后自动校验「源码字符集 ⊆ 输出字体 cmap」，
  并区分「子集漏字」(可修复,应为 0) 与「文楷全量字体本身缺字」(仅报告)
"""
from pathlib import Path
from fontTools.subset import Subsetter, Options
from fontTools.ttLib import TTFont

# 仓库根 = scripts/ 的上一级；无论仓库克隆到哪都能正确扫描
ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'src'
OUT = SRC / 'assets' / 'fonts'
OUT.mkdir(parents=True, exist_ok=True)

# ---- 1. 扫描源码全部字符（ts/tsx/css + index.html，含注释代码，宁多勿缺） ----
chars: set[str] = set()
scan_files: list[Path] = []
for pat in ('*.ts', '*.tsx', '*.css'):
    scan_files.extend(SRC.rglob(pat))
index_html = ROOT / 'index.html'
if index_html.exists():
    scan_files.append(index_html)
for f in scan_files:
    try:
        chars.update(f.read_text(encoding='utf-8'))
    except Exception:
        pass

# ---- 2. 安全冗余：全 ASCII、CJK 标点、全角、常用汉字缓冲 ----
chars.update(chr(c) for c in range(0x20, 0x7F))            # ASCII
chars.update('，。、；：？！…—·「」『』（）《》〈〉【】〔〕'
             '“”‘’％℃℃〇一二三四五六七八九十百千万亿兆'
             '★★☆◆◇●○▲△▼△※→←↑↓×÷±≤≥≠∞√∑')
chars.update(chr(c) for c in range(0xFF01, 0xFF5F))         # 全角形式
chars.update(chr(c) for c in range(0x3000, 0x3040))         # CJK 符号
# 常用汉字缓冲（拟声/数词/雅称等，防新增文案缺字）
COMMON = ('的风云山水月日天 earth 地心手口目见王玉圭石田由甲申电雷雨雪'
          '霜露春秋冬夏天地玄黄宇宙洪荒日月盈昃辰宿列张寒来暑往秋收冬藏'
          '闰余成岁律吕调阳云腾致雨露结为霜金生丽水玉出昆冈剑号巨阙珠称夜光'
          '果珍李柰菜重芥姜海咸河淡鳞潜羽翔龙师火帝鸟官人皇始制文字乃服衣裳'
          '推位让国有虞陶唐吊民伐罪周发殷汤坐朝问道垂拱平章'
          '爱育黎首臣伏戎羌遐迩一体率宾归王'
          '鸣凤在竹白驹食场化被草木赖及万方盖此身发四大五常'
          '恭惟鞠养岂敢毁伤女慕贞洁男效才良知过必改得能莫忘'
          '罔谈彼短靡恃己长信使可覆器欲难量墨悲丝染诗赞羔羊'
          '景行维贤克念作圣德建名立形端表正空谷传声虚堂习听'
          '祸因恶积福缘善庆尺璧非宝寸阴是竞资父事君曰严与敬'
          '孝当竭力忠则尽命临深履薄夙兴温凊似兰斯馨如松之盛'
          '川流不息渊澄取映容止若思言辞安定笃初诚美慎终宜令'
          '荣业所基籍甚无竟学优登仕摄职从政存以甘棠去而益咏'
          '乐殊贵贱礼别尊卑上和下睦夫唱妇随外受傅训入奉母仪'
          '诸姑伯叔犹子比儿孔怀兄弟同气连枝交友投分切磨箴规'
          '仁慈隐恻造次弗离节义廉退颠沛匪亏性静情逸心动神疲'
          '守真志满逐物意移坚持雅操好爵自縻都邑华夏东西二京'
          '背邙面洛浮渭据泾宫殿盘郁楼观飞惊图写禽兽画彩仙灵'
          '丙舍傍启甲帐对楹肆筵设席鼓瑟吹笙升阶纳陛弁转疑星'
          '右通广内左达承明既集坟典亦聚群英杜稿钟隶漆书壁经'
          '府罗将相路侠槐卿户封八县家给千兵高冠陪辇驱毂振缨'
          '世禄侈富车驾肥轻策功茂实勒碑刻名磻溪伊尹佐时阿衡'
          '奄宅曲阜微旦孰营桓公匡合济弱扶倾绮回汉惠说感武丁'
          '俊乂密勿多士寔宁晋楚更霸赵魏困横假途灭虢践土会盟'
          '何遵约法韩弊烦刑起翦颇牧用军最精宣威沙漠驰誉丹青'
          '九州禹迹百郡秦并岳宗泰岱禅主云亭雁门紫塞鸡田赤城'
          '昆池碣石巨野洞庭旷远绵邈岩岫杳冥治本于农务兹稼穑'
          '俶载南亩我艺黍稷税熟贡新劝赏黜陟孟轲敦素史鱼秉直'
          '庶几中庸劳谦谨敕聆音察理鉴貌辨色贻厥嘉猷勉其祗植'
          '省躬讥诫宠增抗极殆辱近耻林皋幸即两疏见机解组谁逼'
          '索居闲处沉默寂寥求古寻论散虑逍遥欣奏累遣戚谢欢招'
          '渠荷的历园莽抽条枇杷晚翠梧桐蚤凋陈根委翳落叶飘摇'
          '游鹍独运凌摩绛霄耽读玩市寓目囊箱易輶攸畏属耳垣墙'
          '具膳餐饭适口充肠饱饫烹宰饥厌糟糠亲戚故旧老少异粮'
          '妾御绩纺侍巾帷房纨扇圆洁银烛炜煌昼眠夕寐蓝笋象床'
          '弦歌酒宴接杯举觞矫手顿足悦豫且康嫡后嗣续祭祀蒸尝'
          '稽颡再拜悚惧恐惶笺牒简要顾答审详骸垢想浴执热愿凉'
          '驴骡犊特骇跃超骧诛斩贼盗捕获叛亡布射僚丸嵇琴阮啸'
          '恬笔伦纸钧巧任钓释纷利俗竝皆佳妙毛施淑姿工颦妍笑'
          '年矢每催曦晖朗曜璇玑悬斡晦魄环照指薪修祜永绥吉劭'
          '矩步引领俯仰廊庙束带矜庄徘徊瞻眺孤陋寡闻愚蒙等诮'
          '谓语助者焉哉乎也')
chars.update(COMMON)
chars.discard('\n'); chars.discard('\r'); chars.discard('\t')

text = ''.join(sorted(chars))
print(f'字符集总数: {len(chars)}')

# ---- 3. 子集化 ----
JOBS = [
    ('LXGWWenKai-Medium.ttf', 'WenKaiMedium.subset.woff2'),
    ('LXGWWenKai-Regular.ttf', 'WenKaiRegular.subset.woff2'),
]
# ---- 3. 子集化 + 覆盖校验 ----
FULL_FONT_DIR = '/usr/share/fonts/truetype/lxgw-wenkai'
codepoints = {ord(c) for c in chars}
for src_name, out_name in JOBS:
    font = TTFont(f'{FULL_FONT_DIR}/{src_name}')
    # 全量字体自身覆盖的码点（用于区分漏字 vs 字体缺字）
    full_cmap: set[int] = set()
    for table in font['cmap'].tables:
        full_cmap |= set(table.cmap.keys())

    opts = Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.desubroutinize = True
    opts.drop_tables += ['DSIG']
    ss = Subsetter(options=opts)
    ss.populate(text=text)
    ss.subset(font)
    out_path = OUT / out_name
    font.save(str(out_path))
    kb = out_path.stat().st_size / 1024
    print(f'{out_name}: {kb:.0f} KB')

    # 覆盖校验：重新读取输出字体 cmap
    out_cmap: set[int] = set()
    for table in TTFont(str(out_path))['cmap'].tables:
        out_cmap |= set(table.cmap.keys())
    leak = sorted(codepoints & full_cmap - out_cmap)      # 子集漏字（必须为 0）
    absent = sorted(codepoints - full_cmap)               # 文楷本身就没有的字
    if leak:
        sample = ''.join(chr(c) for c in leak[:40])
        print(f'  [X] 子集漏字 {len(leak)} 个（样例）: {sample}')
    else:
        print('  [OK] 源码字符集全部落入子集，无漏字')
    if absent:
        sample = ''.join(chr(c) for c in absent[:40])
        print(f'  [!] 文楷全量字体不含 {len(absent)} 个字符（与子集无关，样例）: {sample}')

print('DONE')
