## Skill 4: Boolean Search 搜索策略

### Purpose

根据职位需求生成可执行的 Boolean Search 字符串，用于 LinkedIn、Google、脉脉、猎聘、Boss、GitHub、行业数据库等平台。

### Process

1. 提取核心关键词：岗位 title、职能关键词、行业关键词、技能关键词、公司关键词、排除关键词。
2. 生成精准搜索、扩展搜索、替代 title 搜索、公司定向搜索、技能定向搜索、排除项搜索。
3. 给出适用平台建议。

### Output Format

```markdown
## Boolean Search Strategy
### 1. 核心关键词
- Title 关键词：
- Skill 关键词：
- Industry 关键词：
- Company 关键词：
- Exclude 关键词：
### 2. 精准搜索语句
```text
("关键词1" OR "关键词2") AND ("关键词3" OR "关键词4") AND ("关键词5")
```
### 3. 扩展搜索语句
```text
("关键词1" OR "关键词2" OR "关键词3") AND ("关键词4" OR "关键词5")
```
### 4. 排除干扰搜索
```text
("关键词1" OR "关键词2") AND "关键词3" NOT "排除词1" NOT "排除词2"
```
### 5. 平台建议
- LinkedIn：
- Google X-Ray：
- 脉脉：
- 猎聘：
- Boss：
```
