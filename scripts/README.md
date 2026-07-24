# Rust 构建工具

这里的 Rust 代码只在构建时运行，用于生成和整理部署产物，不参与网站运行时。通过根目录 `pnpm` 命令调用。

## 主要工具

| Cargo bin | 目标 |
| --- | --- |
| `title-font-subset` | 收集文章标题用字，生成标题字体子集和 CSS。 |
| `body-font-subset` | 收集正文用字，生成正文字体子集和 CSS。 |
| `site-artifact-rewrite` | 按 `artifact-rewrite.toml` 改写 `public/` 中的 URL、图片属性等。 |
| `article-short-links` | 为每篇文章生成 `/s/<code>/` 短链接。 |
| `deploy-markdown` | 把文章/文档导出到对应的 `.md` 路由，并把 Zola 内部链接改成可访问的相对链接。 |

通过 pnpm 调用：

```bash
pnpm build:all              # 按顺序跑全部
pnpm build:subset-titlefont # 标题字体
pnpm build:subset-bodyfont  # 正文字体
pnpm build:rewrite-artifacts
pnpm build:short-links
pnpm build:markdown
```


## 代码结构

- `shared/` — 跨工具共用的模块。`lib.rs` 把它们按原名 re-export，引用路径不变。
- `font/` — 字体工具共用逻辑，需启用 `font-tools` feature。
- `bin/<tool>/` — 每个工具自己的代码。大工具里 `main.rs` 启动，`app.rs` 编排流程。
- `bin/<tool>/tests/` — 工具单元测试。
- `integration/` — CLI 冒烟测试。

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

3. 涉及产物的改动还要跑对应的 `pnpm build:*`，跨工具改动跑 `pnpm build:all`。
4. 抽检几个页面的关键文件、manifest 和实际 URL，确认结果正确。

## 环境准备

```bash
cargo install --locked cargo-nextest --version 0.9.140
cargo install --locked cargo-llvm-cov --version 0.8.7
```

覆盖率：

```bash
pnpm coverage:rust   # HTML 报告在 target/llvm-cov/html/
```
