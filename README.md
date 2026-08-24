# World Ledger

全球态势与公开市场数据站点。它从国家和区域市场出发，展示风险偏好代理、价格确认、共同因子拆解与 A/H 市场资金账本的公开快照。

- Website: <https://xieyuh03.github.io/Global-market-intelligence/>
- Source mirror: <https://github.com/xieyuh03/Global-market-intelligence>
- Data boundary: 公开价格、模型结果和经过裁剪的账本快照，不包含账户、持仓、交易、成本、Futu 或数据库凭据

## Source Of Truth

本仓库是 `xieyuh03/workspace` 中 `workspace/investment/public-web` 的单向镜像。全球页面组件和市场分析算法以内部投资应用为源码，通过 CI 校验、复制并发布。不要直接在镜像仓库修改共享文件，下一次同步会覆盖这些改动。

公开站始终使用只读 JSON 快照：

- `market-flows.json`: Yahoo Finance 区域 ETF 与共同因子模型，每个工作日自动刷新
- `global-capital-CN-A.json`: A 股公开资金账本的裁剪快照
- `global-capital-HK.json`: 港股南向资金账本的裁剪快照

价格与成交量只能作为偏好代理，不等于基金申赎或真实跨境资金。账本过期或质量不足时，页面会显式降级为代理证据。

## Local Development

```bash
npm ci
npm run data:refresh-market
npm run dev
```

打开 <http://localhost:3000>。完整发布前检查：

```bash
npm run check
```

该命令依次执行公开边界扫描、ESLint、TypeScript 和静态导出构建。GitHub Pages 部署只上传 `out/`，线上站点没有数据库、写接口或服务端凭据。
