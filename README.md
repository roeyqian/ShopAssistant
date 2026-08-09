# ShopAssistant

> 受 ACM CHI 2026 论文 [BuyMate: Making AI Interventions Effective in Promoting Rational Consumption in Live Commerce](https://doi.org/10.1145/3772318.3790928) 启发的电商 AI 干预研究平台。

ShopAssistant 将直播电商中的高刺激购买场景转化为可运行、可记录的 Web 实验环境。它关注的不是替用户决定“该不该买”，而是在限时、稀缺、从众和价格锚定等压力出现时，为用户提供暂停、核验、比较和反思的机会。

项目以 BuyMate 的理性消费干预理念为设计来源，并在此基础上扩展了促销型 AI 对照、压力画像、冷静小游戏和研究数据后台。前端位于 `view/`，后端 API 位于 `worker/src/`。

## 核心理念

BuyMate 的启发在于：干预应当在消费决策的关键时刻出现，并以温和、透明、尊重自主性的方式呈现。ShopAssistant 将这一理念落实为以下原则：

- **赋能而非替代**：守护型 AI 提供检查路径和信息框架，不替用户下结论。
- **识别压力而非制造压力**：将紧迫、稀缺、社交证明和价格锚定作为可观察的情境线索。
- **让干预可追踪**：记录浏览、AI 对话、加购、撤回、干预使用和最终模拟决策。
- **支持实验比较**：提供促销型 AI 与守护型 AI 两种角色，以及非 AI 冷静任务。

## AI 干预闭环

在一次商品浏览中，ShopAssistant 支持如下研究路径：

```text
商品浏览 / 情境压力
        ↓
用户识别或填写压力线索
        ↓
守护型 AI 提供需求反思、预算校准、同类比较、话术重构或延迟购买建议
        ↓
用户继续浏览、加入待购、移除待购或提交模拟决策
        ↓
研究后台记录事件、AI 对话、压力画像与会话路径
```

促销型 AI 作为研究对照条件，可在用户停留于商品页一段时间后主动发起需求导向的对话；守护型 AI 则强调核验信息、识别诱导表达和恢复审慎判断。

## 已实现功能

### 面向参与者

- 商品样本浏览、分类筛选、搜索、待购清单与模拟决策提交。
- **守护型 AI**：需求反思、预算校准、同类商品比较、销售话术中性重构和冷静延迟建议。
- **促销型 AI**：以需求与商品价值连接为主的研究对照，不使用催单、稀缺或从众表达。
- BuyMate 风格的理性消费支持面板：理性支持模式、五类诱导话术提示和三项同类商品短名单。
- 情境压力探针：记录限时紧迫、库存稀缺、社交证明和价格锚定等线索，生成压力分和压力等级。
- 冷静小游戏：小恐龙跑酷、华容道和 15 数码，作为可记录的非 AI 注意力切换任务。
- 结算前反思清单：在提交模拟决策前记录关键检查是否完成。

### 面向研究者

- 记录浏览、搜索、加购、移除、AI 对话、干预触发、压力探针和模拟决策。
- 管理后台汇总行为量、会话、AI 使用、干预使用频次、压力分布和高频压力线索。
- 商品洞察页展示样本浏览、加购、决策、AI 使用和最近行为时间线。
- 后台配置 DeepSeek 兼容 API、模型名称和两类 AI 的启用状态。

## 与 BuyMate 的关系

| BuyMate 的设计启发 | ShopAssistant 的当前实现 |
| --- | --- |
| 温和、陪伴式的理性消费干预 | 守护型 AI 使用需求反思、预算、比较与延迟购买提示，不替用户决策。 |
| “关键词 + 标签 + 建议”的话术干预形式 | 前端提供五类诱导话术提示；用户也可将具体话术交给守护型 AI 重构。 |
| 同类商品的简短、可解释比较 | 从本地样本库中选择同品类的三个候选商品，综合销量、评分、价格相似度和品牌多样性。 |
| 在决策关键时刻介入 | 商品浏览、压力探针、加购后和结算前均可触发干预或记录事件。 |
| 评估理性消费支持的效果 | 通过行为日志、AI 对话、压力画像、决策记录和会话路径支持后续研究。 |

## 项目边界

ShopAssistant 是受 BuyMate 启发的研究平台与工程原型，**不是论文的逐项复现**，也不是生产级购物建议服务。

- 当前使用的是站内商品样本和模拟决策，不接入真实直播平台或真实支付。
- 当前不包含主播音频转写、实时商品切换识别，或 BuyMate 论文所述的自动化 `G1 → G2 → G3` 话术分析流水线。
- 话术类别、压力分和同类商品排序均服务于研究原型；它们不构成经过验证的心理测量或真实市场结论。
- 仓库不包含原论文的完整实验材料、分组流程、量表、参与者数据或统计脚本。
- 正式研究前应补充知情同意、匿名化导出、随机分组、实验预注册与伦理审查。

详细的研究目标、变量、事件与限制请参阅 [DOC.md](DOC.md)。

## 技术栈

- Vue.js + Vite
- Cloudflare Workers
- Cloudflare D1
- Cloudflare KV
- DeepSeek 兼容 Chat Completions API（流式输出）

## 项目结构

```text
view/                         Vue 前端：商品浏览、AI 干预、压力探针、小游戏与后台界面
worker/src/app/               Worker 入口、HTTP 工具与路由注册
worker/src/modules/ai/        促销型 / 守护型 AI、流式模型调用与对话记录
worker/src/modules/shop/      商品样本、同类商品和样本洞察
worker/src/modules/research/  行为追踪与研究汇总
worker/src/modules/*/         认证、待购清单、模拟决策与后台管理
worker/store/migrations/      D1 表结构、迁移与种子数据
```

## 本地运行

安装 Worker 依赖并启动本地服务：

```bash
cd worker
npm install
npm run dev
```

构建前端：

```bash
cd view
npm install
npm run build
```

`wrangler dev` 会同时提供 API 和已构建的静态页面。

## 数据库初始化

创建并绑定 D1 数据库后，在 `worker/` 目录依次运行：

```bash
npm run db:init
npm run db:seed
npm run db:events
npm run db:i18n
npm run db:interventions
npm run db:ai-safety
npm run db:product-chat-history
npm run db:add-products
npm run db:more-product-i18n
```

当前脚本使用的数据库名为 `zero-1-base`。如使用其他数据库名，请同步更新 `worker/package.json` 中的脚本。

已有旧数据库时，请补跑 `worker/store/migrations/0003_order_events.sql`、`worker/store/migrations/0004_product_i18n.sql`、`worker/store/migrations/0006_intervention_behavior.sql`、`worker/store/migrations/0007_ai_conversation_safety.sql`、`worker/store/migrations/0008_product_chat_history.sql`、`worker/store/migrations/0009_add_more_products.sql` 和 `worker/store/migrations/0010_more_product_i18n.sql`。

## AI 配置

以管理员身份登录后，在研究后台填写 DeepSeek API Key、Base URL 和模型名，并按实验条件启用或停用促销型 AI 与守护型 AI。请在正式数据收集前记录模型、提示词、参数、样本材料和项目版本。

## API 概览

- `GET /api/products`、`GET /api/products/:id/insights`、`GET /api/categories`
- `GET /api/cart`、`GET /api/orders`
- `POST /api/ai/chat`、`POST /api/ai/promotional-nudge`、`GET /api/ai/history`
- `POST /api/research/track`、`GET /api/research/summary`
- `GET /api/admin/ai-config`、`GET /api/admin/orders`、`PUT /api/admin/orders/:id/status`

## License

MIT
