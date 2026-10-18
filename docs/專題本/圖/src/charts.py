import json, math, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

OUT = r"C:\Users\lkj75\Documents\Blockchain-Game\docs\專題本\圖"
SP = os.path.dirname(os.path.abspath(__file__))
plt.rcParams.update({
    "font.family": ["Microsoft JhengHei", "DejaVu Sans", "Segoe UI Symbol"], "font.size": 11, "axes.unicode_minus": False,
    "axes.edgecolor": "#333333", "axes.linewidth": 0.8, "savefig.dpi": 300,
    "axes.spines.top": False, "axes.spines.right": False,
})
DARK, MID, LIGHT, ACCENT = "#222222", "#7a7a7a", "#c8c8c8", "#1f4e9e"


def save(fig, name):
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, name), bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print("saved", name)


# 圖四 Crash 倍率分布：P(X ≥ m) = 1/m，100× 封頂
m = np.logspace(0, 2, 400)
fig, ax = plt.subplots(figsize=(6.4, 3.8))
ax.plot(m, 1 / m, color=DARK, lw=2, label="P(X ≥ m) = 1/m")
ax.plot([100, 140], [0, 0], color=DARK, lw=2)
ax.vlines(100, 0, 0.01, color=DARK, lw=2, linestyles=":")
for mm in [2, 10, 50]:
    ax.plot(mm, 1 / mm, "o", color=ACCENT, ms=5)
    ax.annotate(f"m = {mm}：{100/mm:g}%", (mm, 1 / mm), textcoords="offset points", xytext=(8, 6), fontsize=9.5)
ax.set_xscale("log")
ax.set_xlim(1, 140)
ax.set_ylim(0, 1.05)
ax.set_xlabel("目標倍率 m（對數座標）")
ax.set_ylabel("撐到 m 倍以上的機率")
ax.text(1.15, 0.12, "期望報酬 = m × 1/m = 1\n（100× 以上封頂，截斷長尾）", fontsize=9.5, color=MID)
ax.set_xticks([1, 2, 5, 10, 20, 50, 100])
ax.set_xticklabels(["1×", "2×", "5×", "10×", "20×", "50×", "100×"])
ax.legend(frameon=False, loc="upper right")
save(fig, "fig04_crash_dist.png")

# 圖五 Plinko 二項分布與倍率
PLINKO = [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16]
k = np.arange(17)
theo = np.array([math.comb(16, i) / 65536 * 100 for i in k])
fig, ax = plt.subplots(figsize=(6.8, 3.9))
ax.bar(k, theo, color=LIGHT, edgecolor=DARK, lw=0.6, label="落點機率 C(16,k)/2¹⁶")
ax.set_xlabel("槽位 k（16 個位元中 1 的個數）")
ax.set_ylabel("機率（%）")
ax.set_xticks(k)
ax2 = ax.twinx()
ax2.spines["right"].set_visible(True)
ax2.plot(k, PLINKO, "o-", color=DARK, lw=1.4, ms=4, label="賠付倍率")
ax2.set_yscale("log")
ax2.set_ylabel("賠付倍率（對數座標）")
ax2.set_yticks([0.5, 1, 2, 5, 10, 16])
ax2.set_yticklabels(["0.5×", "1×", "2×", "5×", "10×", "16×"])
ax2.axhline(1, color=MID, lw=0.8, ls="--")
h1, l1 = ax.get_legend_handles_labels(); h2, l2 = ax2.get_legend_handles_labels()
ax.legend(h1 + h2, l1 + l2, frameon=False, loc="lower center", bbox_to_anchor=(0.5, 1.0), ncol=2, fontsize=9.5)
save(fig, "fig05_plinko_dist.png")

# 圖六 資金池鎖定機制示意（依合約規則計算之範例）
steps = [
    ("初始注資\n1.000 ETH", 1.000, 0.000),
    ("玩家 A 下注\nPlinko 0.01\n鎖定 16×", 1.010, 0.160),
    ("玩家 B 下注\n輪盤單號 0.01\n鎖定 30×", 1.020, 0.460),
    ("擁有者提領 0.5\n（上限 0.56）", 0.520, 0.460),
    ("A 結算 1.1×\n付 0.011，解鎖", 0.509, 0.300),
    ("B 逾期\n宣告過期，解鎖", 0.509, 0.000),
]
fig, ax = plt.subplots(figsize=(7.4, 4.0))
x = np.arange(len(steps))
bal = np.array([s[1] for s in steps]); lock = np.array([s[2] for s in steps])
ax.bar(x, lock, color=DARK, width=0.6, label="已鎖定（未結算局的最大可能賠付）")
ax.bar(x, bal - lock, bottom=lock, color=LIGHT, edgecolor=MID, lw=0.6, width=0.6, label="可用（可接新注／擁有者可提領）")
for i, (b, l) in enumerate(zip(bal, lock)):
    ax.text(i, b + 0.02, f"{b:.3f}", ha="center", fontsize=9)
    if l > 0.05:
        ax.text(i, l / 2, f"{l:.2f}", ha="center", va="center", color="white", fontsize=9)
ax.set_xticks(x)
ax.set_xticklabels([s[0] for s in steps], fontsize=8.6)
ax.set_ylabel("合約餘額（ETH）")
ax.set_ylim(0, 1.25)
ax.legend(frameon=False, loc="upper right", fontsize=9)
ax.text(-0.35, 1.17, "不變量：合約餘額 ≥ 已鎖定；擁有者只能提領「可用」部分", fontsize=9.5, color=DARK)
save(fig, "fig06_pool_lock.png")

# 圖七 驗證模式之信任邊界
cols = ["瀏覽器\n本地資料", "本網站\n前端程式", "RPC 節點", "區塊鏈\n共識", "出塊者\n不與玩家串通"]
rows = ["本地紀錄", "網頁・公平局\n（GameCommitReveal）", "網頁・下注局\n（FairBet v3）", "命令列工具\n（FairBet v3）"]
M = [
    ["需", "需", "－", "－", "NA"],
    ["－", "需", "需", "需", "NA"],
    ["－", "需", "可交叉", "需", "需"],
    ["－", "－", "可交叉", "需", "需"],
]
verdict = ["最多判為「未完成」", "只證明揭露值與承諾一致\n無法證明種子來源獨立", "可完整驗證五項證據", "可完整驗證五項證據\n不經過本網站"]
fig, ax = plt.subplots(figsize=(8.2, 3.9))
ax.set_xlim(0, len(cols) + 2.2); ax.set_ylim(0, len(rows) + 1)
ax.axis("off")
style = {"需": ("●", DARK), "－": ("○", MID), "可交叉": ("◐", DARK), "NA": ("—", MID)}
for j, c in enumerate(cols):
    ax.text(j + 1.5, len(rows) + 0.5, c, ha="center", va="center", fontsize=9.5, weight="bold")
ax.text(len(cols) + 1.6, len(rows) + 0.5, "可證明的範圍", ha="center", va="center", fontsize=9.5, weight="bold")
for i, r in enumerate(rows):
    y = len(rows) - i - 0.5
    ax.add_patch(plt.Rectangle((0, y - 0.5), len(cols) + 2.2, 1, color="#f2f2f2" if i % 2 == 0 else "white", zorder=0))
    ax.text(0.5, y, r, ha="center", va="center", fontsize=9.5)
    for j, v in enumerate(M[i]):
        sym, colr = style[v]
        ax.text(j + 1.5, y, sym, ha="center", va="center", fontsize=15, color=colr)
    ax.text(len(cols) + 1.6, y, verdict[i], ha="center", va="center", fontsize=8.6)
ax.text(0, -0.15, "● 需要信任　◐ 可換用其他 RPC 交叉驗證以降低信任　○ 不需要　— 不適用（此模式不涉及區塊熵）", fontsize=9, color=MID)
save(fig, "fig07_trust_boundary.png")

# 圖十一 各遊戲 RTP 收斂
data = json.load(open(os.path.join(SP, "rtp_sim.json"), encoding="utf-8"))
fig, axes = plt.subplots(2, 4, figsize=(9.6, 4.8), sharex=True)
for ax, g in zip(axes.flat, data):
    n = np.array([p[0] for p in g["pts"]]); r = np.array([p[1] for p in g["pts"]])
    band = 3 * g["sd"] / np.sqrt(n)
    ax.fill_between(n, g["theo"] - band, g["theo"] + band, color="#e3e3e3", lw=0)
    ax.axhline(g["theo"], color=MID, lw=1, ls="--")
    ax.plot(n, r, color=DARK, lw=1.2)
    ax.set_xscale("log")
    ax.set_title(g["name"], fontsize=9.5)
    span = 0.6 if "單號" in g["name"] else 0.35
    ax.set_ylim(g["theo"] - span, g["theo"] + span)
    ax.tick_params(labelsize=8)
for ax in axes[1]: ax.set_xlabel("局數（對數）", fontsize=9)
for ax in axes[:, 0]: ax.set_ylabel("累積 RTP", fontsize=9)
fig.text(0.5, -0.02, "實線：實測累積 RTP　虛線：理論值　灰帶：理論值 ± 3 個標準誤", ha="center", fontsize=9, color=MID)
save(fig, "fig11_rtp_convergence.png")

# 圖十二 Plinko 實測 vs 理論（表十三，N = 50,000）
meas = [0.002, 0.038, 0.168, 0.790, 2.818, 6.704, 12.144, 17.862, 19.546, 17.278, 12.160, 6.636, 2.862, 0.774, 0.200, 0.018, 0.000]
fig, ax = plt.subplots(figsize=(6.8, 3.7))
ax.bar(k, meas, color=LIGHT, edgecolor=DARK, lw=0.6, label="實測（N = 50,000）")
ax.plot(k, theo, "o-", color=DARK, ms=4, lw=1.2, label="理論 B(16, 1/2)")
ax.set_xticks(k)
ax.set_xlabel("槽位 k")
ax.set_ylabel("機率（%）")
ax.legend(frameon=False)
save(fig, "fig12_plinko_measured.png")

# 圖十三 Crash 尾端機率（表十四，對數座標）
mm = np.array([1.5, 2, 3, 5, 10, 20, 50])
emp = np.array([66.492, 50.066, 33.466, 20.054, 10.226, 5.058, 2.032])
xs = np.logspace(np.log10(1.2), np.log10(80), 100)
fig, ax = plt.subplots(figsize=(6.0, 3.8))
ax.plot(xs, 100 / xs, color=MID, lw=1.4, ls="--", label="理論 1/m")
ax.plot(mm, emp, "o", color=DARK, ms=6, label="實測（N = 50,000）")
ax.set_xscale("log"); ax.set_yscale("log")
ax.set_xticks(mm); ax.set_xticklabels([f"{v:g}×" for v in mm])
ax.set_yticks([2, 5, 10, 20, 50, 100]); ax.set_yticklabels(["2%", "5%", "10%", "20%", "50%", "100%"])
ax.set_xlabel("目標倍率 m")
ax.set_ylabel("P(X ≥ m)")
ax.legend(frameon=False)
save(fig, "fig13_crash_tail.png")
