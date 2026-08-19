# Rust 构建工具

这里的 Rust 代码只在构建时运行，用于生成和整理部署产物，不参与网站运行时。通过根目录 `pnpm` 命令调用。

## 主要工具

| Cargo bin | 目标 |
| --- | --- |
| `title-font-subset` | 收集文章标题用字，生成标题字体子集和 CSS。 |
| `body-font-subset` | 收集正文用字，生成正文字体子集和 CSS。 |
| `site-artifact-rewrite` | 按 `artifact-rewrite.toml` 改写 `public/` 中的 URL、图片属性等。 |
| `article-short-links` | 为已发布文章分配 `/s/YYNNN/`，并同步到 Zola `aliases`。 |
| `deploy-markdown` | 把文章/文档导出到对应的 `.md` 路由，并把 Zola 内部链接改成可访问的相对链接。 |

### 字体子集化

两个字体工具共用的子集化参数（`scripts/rust/font/asset.rs`）：

- **layout features**：枚举源字体 GSUB+GPOS 的全部 feature，剔除竖排黑名单
  `vert/vrt2/vkrn/vpal/vhal/vchw/valt/vjmo` 后显式传给 skera。网页只做横向排版，
  竖排 feature 及其独占的竖排变体字形不会进入子集。
- **glyph 编号**：不保留原始 GID（去掉 `RETAIN_GIDS`），子集紧凑重编号。源字体
  （思源黑体/宋体）的全部表要么由 skera 处理、要么不含 GID 引用（如 `vhea`），
  审计通过；若未来换用含 AAT 表（`morx/kerx/trak/ankr`）的源字体需重新审计。
- **WOFF2 压缩**：`woofwoof` quality 11（brotli 最高档）。

实测收益（2026-08，serif 标题字体 / sans patch 正文字体）：竖排黑名单约 −1.4%/−0.3%，
去掉 GID 保留约 −2%/−2%，quality 8→11 约 −8%/−8%，合计约 **−10.8% / −10.0%**。

### 分块与排序

两个工具按同一规则把子集拆成 chunk 系列（`scripts/rust/font/chunk.rs` + `frequency.rs`）：

- **排序**：站内码位按本站语料出现次数降序（正文语料 = 文章正文 + 非 title front
  matter + `zola.toml` + `i18n/zh.toml` 的全部字符串；标题语料 = 文章 title）；语料外
  的字按 Google 简体中文字体切片表（`scripts/rust/data/font-slicing.config.json`，源自
  googlefonts/nam-files，Apache-2.0，文件内附来源与校验和）的相对顺序补在后面，
  仍不在表里的按码位升序收尾。
- **切块**：在排好序的码位上取压缩后不超过 `CHUNK_TARGET_BYTES`（55 KiB）的最长
  前缀；末尾不足 `CHUNK_MIN_BYTES`（28 KiB）的尾巴并入上一块。边界定位分两阶段：
  先用 q9（比 q11 快约 15 倍、体积只大几个百分点）做倍增探测 + 扇出细化找到保守
  边界，再按种子实测的字节余量估计还能容纳的字数，以 q11 单步探测精确收尾——每个
  批次内部用 rayon 并行压缩，且胜出探测的字节直接成为最终块，不做二次压缩。
- **字符分界**：CJK 族字符（汉字、假名、CJK 标点）进频率分块系列；其余字符
  （ASCII、拉丁扩展、西文符号）集中为一个 `<系列名>-latin.<16位哈希>.woff2`
  子集，其 `@font-face` 规则排在 CSS 最前，数字/英文等高频西文只触发这一个
  小文件。
- **文件名**：`<系列名>-<序号>.<16位哈希>.woff2`（块）与
  `<系列名>-latin.<16位哈希>.woff2`（西文子集），内容寻址，配合 Vercel
  `/fonts/*` 的 immutable 缓存；旧产物清理只匹配这些模式与历史单文件产物。
- **预载**：西文子集 + 第 1 块（最高频）的服务路径以 `{"paths": [...]}` 写入
  `static/_cache/font-preload-{body,title}.json`，`base.html` 用
  `load_data(required=false)` 读出后逐条输出 `<link rel="preload">`；缓存缺失
  （本地未跑子集化）时跳过预载，不影响构建。
- 正文字体的 L1/L2/L3 静态分块已于 2026-08 删除：patch 系列独占声明全部站内码位，
  避免一个字同时触发两个字体文件加载；`source-han-sans-sc-vf.css` 只保留注释占位，
  仍作为 `--base-css` 输入做重叠校验。

两个工具生成的 `@font-face` 描述符从**子集输出字体**读取，而非硬编码：

- 有 `fvar` 的 `wght` 轴 → `font-weight: <min> <max>`（思源 VF 实际是 `250 900`）；
- 无 `fvar` 有 `OS/2` → `usWeightClass` 单值；
- 两者皆无 → 省略 `font-weight`。

校验（构建失败即停）：

- 子集输出必须满足 `(请求字符 ∩ 源字体 cmap) ⊆ 输出 cmap`；源字体不支持的字符
  （如标题里的 emoji）只警告，不失败。
- body 工具逐 `@font-face` 校验 base CSS：`(声明范围 ∩ 源 cmap) ⊆ chunk cmap`，
  src 缺失/解压失败/缺字报错，chunk 含未声明码位报警告；同一 family 的
  `font-weight` 描述符必须一致（混用会让 Chrome 按字重桶跳过部分 face）。base
  CSS 与分块文件漂移时构建会失败——2026-08 曾借此发现并修复了 95 个「声明但任何
  chunk 都不含」的码位（其中 12 个实际出现在正文里，此前静默回退到系统字体）。
  旧 L1/L2/L3 表还另有 992 个码位被重复声明，浏览器取文档序最后一条匹配规则，
  导致 L1 层整体被 L2 遮蔽、从未加载；新的单归属声明（patch 系列独占）从结构上
  消除了这类问题。

字体与 CSS 写入幂等：内容不变时不落盘，避免 mtime 抖动。

通过 pnpm 调用：

```bash
pnpm build:all              # 按顺序跑全部
pnpm build:subset-titlefont # 标题字体
pnpm build:subset-bodyfont  # 正文字体
pnpm build:rewrite-artifacts
pnpm sync:short-links       # 写入缺失的短链接 alias 和永久预留台账
pnpm check:short-links      # 只校验，不修改文件
pnpm build:markdown
```


## 代码结构

- `shared/` — 跨工具共用的模块。`lib.rs` 把它们按原名 re-export，引用路径不变。
- `font/` — 字体工具共用逻辑，需启用 `font-tools` feature。
- `bin/<tool>/` — 每个工具自己的代码。大工具里 `main.rs` 启动，`app.rs` 编排流程。
- `bin/<tool>/tests/` — 工具单元测试。
- `integration/` — CLI 冒烟测试。
- `benchmarks/` — 基准测试记录（方法 + 数据），供后续改动对照。

原则：跨工具共享的放 `shared/`，单工具专属的放 `bin/<tool>/`。

## Cargo feature

默认不编译字体和图片相关依赖，按需开启：

- `font-tools` — 标题、正文字体工具。
- `artifact-rewrite` — 产物改写工具。

直接跑 bin 时需手动启用：

```bash
cargo run --locked --features font-tools --bin title-font-subset -- --help
cargo run --locked --features artifact-rewrite --bin site-artifact-rewrite -- --help
```

日常直接用 pnpm 命令即可，参数已配好。

## 开发规范

- 用仓库固定的 Rust 版本（`rust-toolchain.toml`）。依赖锁定在 `Cargo.lock`，CI 和构建统一加 `--locked`。
- 错误用 `anyhow::Result`，加 `.context()` 说明失败时在做什么。
- CLI 用 `clap`，`--help` 要让人看得懂。
- 路由、slug、front matter 解析逻辑只在一处实现，重复则抽到 `shared/`。
- 短链接的跳转页由 Zola `aliases` 生成；Rust 工具只维护文章元数据，不读取或修改 `public/`。
- 短码格式为 `YYNNN`。同一年内以文件名 SHA-256 对 1000 取模，碰撞时顺序探测；`scripts/rust/data/short-link-reservations.json` 中的号码永久不复用。
- 写文件前检查目标不是符号链接/目录/别人的文件。manifest 用原子写入，清理时只删自己记录的内容。
- 输出要可复现：排序稳定，版本标记用 commit SHA 不用分支名。
- 新增路径/清理逻辑时至少覆盖正常、冲突和异常情况，测试放 `#[cfg(test)] mod tests` 或 `tests/` 目录。
- 验证结果靠重新构建，不要手动改 `public/`。

## 开发流程

1. 改之前搞清楚数据来源——Zola canonical 路由以真实构建产物为准，不能靠 Markdown 文件名推测。
2. 改完跑：

   ```bash
   cargo fmt --all -- --check
   cargo clippy --locked --all-targets --all-features -- -D warnings
   pnpm test:rust
   ```

   `pnpm test:rust` 用 nextest 并行跑全部 feature（CI 不开 fail-fast，一次看全所有失败）。之后单独跑 `cargo test --doc`（nextest 不执行 doctest）。

3. 新增已发布文章时先跑 `pnpm sync:short-links`；构建只运行 `check:short-links`，不会暗中修改文章。
4. 涉及产物的改动还要跑对应的 `pnpm build:*`，跨工具改动跑 `pnpm build:all`。
5. 抽检几个页面的关键文件、预留台账和实际 URL，确认结果正确。

## 环境准备

```bash
cargo install --locked cargo-nextest --version 0.9.140
cargo install --locked cargo-llvm-cov --version 0.8.7
```

覆盖率：

```bash
pnpm coverage:rust   # HTML 报告在 target/llvm-cov/html/
```
