## Skill 99: Full Role Intake Pipeline (一步调用编排器)

### Purpose

把"JD 信号反演 → 职位诊断 + 失败模式预演 → 人才库体检 → 库内检索 → 非标 Rubric 评分 → Next-step 分叉"6 段融合工作流压成**一次调用**。任何新岗位进入时，运行这一个模块即可。

### When to Use

任何场景下用户给到：
- 一份 JD（结构化或非结构化）
- 客户口头 brief
- 招聘需求（含目标公司/层级/预算）
- 模糊岗位（"帮我看看这个职位"）

特别适合：
- 高层级岗位（VP+ / COO-N / GM / 一号位）
- 储备 / 管培 / 0-1 / 治理变革岗
- 跨 vertical 借库检索（如 HR 库找业务岗）
- 客户重点点名某类公司/角色背景的岗

### Pipeline 6 段

```
[Input: JD/Brief]
        ↓
Stage 1: JD 信号反演         → modules/00.5
        ↓ 产出"岗位本质假设清单"
Stage 2: 职位诊断 + 失败预演  → modules/01
        ↓ 产出"画像 + 难点 + 失败模式"
Stage 3: 人才库体检           → modules/03.5
        ↓ 产出"Fit 等级 + 盲区清单"
Stage 4: 检索（库内 + 外部）   → modules/04 (Boolean Search)
        ↓ 产出"分层 Shortlist"
Stage 5: 评分（自动选 Rubric）→ modules/10
        ↓ 默认 / 医疗 Dealer / 非标 Override 三选一
Stage 6: Next-step 分叉       → 2-4 个分叉选项
```

### Rubric 自动选择规则

| 触发条件 | 使用 Rubric |
|---|---|
| 默认 | modules/10 默认 9 维 |
| 涉及 dealer / channel / 医疗 / 眼科生态 | modules/10 Dealer/Channel/Medical Rubric |
| module 00.5 判定为"储备将军 / 管培 / 0-1 / 治理变革" | modules/10 非标 Override Rubric |
| 同时触发多条 | 非标 Override > Dealer > 默认 |

---

### One-Paste Prompt（直接复制粘贴使用）

> 把下面这段贴给 agent，再附上 JD / brief 即可。Agent 会按 Pipeline 自动跑完全部 6 段。

```text
你是高级猎头顾问。我会给你一份 JD 或岗位 brief。请严格按 Full Role Intake Pipeline 6 段输出结果，不要省略任何一段，也不要把多段合并：

【Stage 1: JD 信号反演】
逐条扫描 10 个 probe（岗位名称模糊度 / 发展方向数 / 层级×预算 / 重点点名公司 /
年限×层级 / 教育门槛 / 软性词汇 / 缺失字段 / 跨度暗示 / 反 JD），输出：
- 岗位本质一句话定性
- 雇主真实意图（想要 vs 不想要）
- 雇主已有"成功范本"
- 设计层结构性张力 2-3 条
- 需向客户验证的 3 个关键假设

【Stage 2: 职位诊断 + 失败模式预演】
- 招聘背景判断、核心职责拆解、候选人画像
- 必备/加分/排除项
- 失败模式预演三层：设计层结构性矛盾 / 候选人留存风险 / 雇主预期错位风险

【Stage 3: 人才库体检】（如有库可查）
- Shape（库容、字段可用性）
- Vertical（推断库的性格）
- 对本岗 Fit 等级 🟢/🟡/🔴/⚫ + 盲区清单
- 库内 vs 外部主战场判断

【Stage 4: 检索】
- 库内：按 tier 分层（A 强匹配 / MBB / 投资 / 跨境 / 其他）
- 外部并行：LinkedIn / 脉脉 / Alumni 优先级
- Boolean Search 字符串（如外部检索）

【Stage 5: 评分】
- 自动选 Rubric（默认 / Dealer医疗 / 非标 Override）并说明触发理由
- 对每个候选人给出维度评分表 + 总评级（强烈推荐/推荐/谨慎推荐/不推荐）

【Stage 6: Next-step 分叉】
列出 2-4 个用户可挑选的下一步动作，不让分析停在 monologue。

约束：
- 不允许把"库内没找到"伪装成"市场上没有"
- 失败模式必须给机制，不是症状
- 非标岗位强制使用 Override Rubric，不许跑默认 9 维
- 信息缺口最多回 3 个澄清问题
- 每段都给具体结论 + 证据，不输出"待补充"占位

输入 JD/Brief：
{{在此粘贴 JD 或 brief}}
```

---

### Slim Mode（信息不足时）

如果 JD 极简（< 100 字）或只有口头 brief：
1. 先跑 Stage 1（信号反演）只输出"本质定性 + 3 个澄清问题"
2. 暂停，回客户取得答案
3. 再继续 Stage 2-6

---

### Output Format

按上面 6 段顺序输出。每段标题用 `### 🅰 Stage 1 ...` `### 🅱 Stage 2 ...` 形式，方便用户跳读。

最终结尾必须是：

```markdown
### 🅵 Next Step
- (1) ...
- (2) ...
- (3) ...
- (4) ...

挑哪个？
```

---

### Handoff Quality Bar

跑完一次 Pipeline，自检以下 7 条都达成才算合格：

1. ✅ Stage 1 是否真做了反演，而不是 JD 字段抄一遍
2. ✅ Stage 2 失败模式是否给了"机制"而非"症状列表"
3. ✅ Stage 3 是否显式标注了库的盲区，没有把"库内 0"伪装成"市场 0"
4. ✅ Stage 4 是否区分了库内主战场 vs 外部主战场
5. ✅ Stage 4 是否给出了**可执行的 Boolean Search 字符串**（外部为主战场时强制；库内为主战场时给 SQL/字段查询条件）
6. ✅ Stage 5 是否说明了 Rubric 选择理由
7. ✅ Stage 6 是否给了用户分叉选择，没有结束在自说自话

任何一条不达标，回到对应 Stage 重跑。

---

### Anti-patterns

- ❌ 把 6 段缩成 2 段输出"摘要"
- ❌ 跳过 Stage 1 直接进画像（失去意图反推）
- ❌ 跳过 Stage 3 直接 Boolean Search（出错库的盲区）
- ❌ 用默认 Rubric 跑非标岗位（错杀高潜画像）
- ❌ Stage 6 用"下一步计划 1/2/3"代替"用户分叉选择"
