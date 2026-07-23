# Rust 构建工具

这个目录里的 Rust 代码负责生成和整理部署产物，不参与网站运行时逻辑。正常情况下从仓库根目录通过 `pnpm` 脚本调用，不要直接修改 `public/` 里的生成文件。

## 主要工具

| Cargo bin | 入口文件 | 作用 |
| --- | --- | --- |
| `title-font-subset` | `bin/title_font_subset/main.rs` | 收集文章标题用字，生成标题字体子集和对应 CSS。 |
| `body-font-subset` | `bin/body_font_subset/main.rs` | 收集正文和配置中的用字，生成正文字体补丁和对应 CSS。 |
| `html-img-host-rewrite` | `bin/html_img_host_rewrite/` | 重写构建后 HTML 中的图片地址，并补充尺寸、比例和 ThumbHash 等元数据。 |
| `article-short-links` | `bin/article_short_links/` | 根据文章 canonical 路由生成 `/s/<code>/` 短链接和持久化 manifest。 |
| `deploy-markdown` | `bin/deploy_markdown/` | 把文章、文档源 Markdown 导出到对应的 `.md` 路由，并写入来源和页面地址。 |

对应的常用命令已经放在根目录 `package.json` 中：

```bash
pnpm build:subset-titlefont
pnpm build:subset-bodyfont
pnpm build:rewrite-imgs
pnpm build:short-links
pnpm build:markdown
```

`pnpm build:all` 会按正确顺序运行完整构建流程。

## 代码结构

`lib.rs` 是共享模块入口，根目录不放具体实现。两个或更多工具都会用到的规则放入职责目录，
只属于一个工具的代码放在对应 `bin/<tool>/` 内。

- `shared/`：跨工具共享的内容、路由、文件系统和 URL 基础设施。`lib.rs` 将这些模块按原名称
  重新导出，因此调用方仍使用 `hibikilogy_tools::managed_fs` 等稳定路径。
- `shared/article_source.rs`：解析带日期的文章文件名。
- `shared/content_routes.rs`：解析 slug、规范化路由并检查 Zola 页面产物。
- `shared/front_matter.rs`：拆分和解析 TOML front matter。
- `shared/managed_fs.rs`：安全创建目录、拒绝危险目标并原子写文件。
- `shared/managed_json.rs`：在安全写入基础上读取、保存 JSON 状态。
- `shared/content_files.rs`：稳定排序并检查 Markdown 输入文件。
- `shared/url_encoding.rs`：统一部署 URL 的路径和查询参数编码。
- `font/`：多个字体工具共用的字体子集和产物发布逻辑，仅在 `font-tools` feature 下编译。

以下模块只服务于某一类工具，由对应入口文件通过 `mod` 引入：

- 标题字体：`bin/title_font_subset/`。
- 正文字体：`bin/body_font_subset/`。
- 图片：`bin/html_img_host_rewrite/`，包括该工具独占的 `thumbhash.rs`。
- 大型工具放在 `bin/<tool>/`；有独立编排层时，`main.rs` 只负责启动，`app.rs` 负责流程。
- 图片改写：`html.rs` 使用 `lol_html` 处理生成后的 HTML，`images.rs`、`urls.rs`、`cache.rs` 分别负责图片元数据、URL 和缓存。
- 工具单元测试：放在对应的 `bin/<tool>/tests/`。
- CLI 冒烟测试：`integration/cli_smoke.rs`。

简单判断方式：

- 跨工具共用的内容放进 `lib.rs` 对应的共享模块。
- 只和一个工具有关的内容留在该工具内部。
- CLI 参数解析和流程编排放入口文件，具体规则尽量拆成可测试的函数。

## Cargo feature

默认 feature 保持轻量，短链接和 Markdown 导出不需要编译字体、图片依赖。

- `font-tools`：标题和正文字体工具。
- `image-tools`：HTML 图片改写工具。

测试临时目录统一使用 `tempfile`，不要自行拼接 PID 和时间戳，也不要手写 `Drop` 清理。

直接运行带可选依赖的 bin 时要显式启用 feature：

```bash
cargo run --locked --features font-tools --bin title-font-subset -- --help
cargo run --locked --features image-tools --bin html-img-host-rewrite -- --help
```

优先使用已有的 `pnpm` 命令，它们已经带上正确参数。

## 开发规范

- 使用仓库 `rust-toolchain.toml` 固定的 Rust 版本，不在本地和 CI 各用一套版本。
- 依赖必须记录在 `Cargo.lock` 中；CI 和构建命令使用 `--locked`。
- 错误使用 `anyhow::Result` 返回，并用 `context` 说明“处理什么时失败”，不要只留下系统错误。
- CLI 使用 `clap`，参数名和默认值要能从 `--help` 看懂。
- 路由、slug 和 front matter 规则只能有一个实现；出现重复时抽到共享模块。
- 第三方库只解决仓库里真实存在的问题。HTML 解析使用 `lol_html`；没有异步 trait 或 Rust 代码生成需求时，不引入 `async-trait`、`syn`、`quote`。
- 写入生成文件前检查目标类型和归属，不覆盖符号链接、目录或非本工具管理的文件。
- 需要替换的 manifest 和产物使用原子写入；清理旧文件时只删除 manifest 记录的内容。
- 输出应可重复构建。需要标记源码版本时使用 commit SHA，不使用会变化的分支名。
- 不依赖遍历顺序；生成 manifest 或批量输出前先稳定排序。
- 新增路径、路由或清理逻辑时，至少测试正常情况、冲突情况和危险路径。
- 测试放在对应模块的 `#[cfg(test)] mod tests` 中；大型工具使用自己的 `tests/` 目录。
- 不手改 `public/` 验证结果。重新构建，再检查真实产物。

## 开发流程

修改前先确认工具依赖的数据来自哪里。Zola canonical 路由应以真实构建产物为准，不能只根据 Markdown 文件名猜。

修改后运行：

```bash
cargo fmt --all -- --check
cargo clippy --locked --all-targets --all-features -- -D warnings
pnpm test:rust
```

`pnpm test:rust` 使用 `cargo-nextest` 并行执行完整 feature 集合。仓库通过
`.config/nextest.toml` 固定最低版本，并在 CI 中关闭 fail-fast，确保一次运行能看到全部失败。
不为失败测试自动重试，避免把真实的不稳定测试伪装成通过。nextest 不执行 doctest，
所以该命令随后还会单独运行 `cargo test --doc`。

首次在本地运行前安装仓库固定的工具版本：

```bash
cargo install --locked cargo-nextest --version 0.9.140
cargo install --locked cargo-llvm-cov --version 0.8.7
```

`llvm-tools-preview` 已由 `rust-toolchain.toml` 声明，无需单独配置。

需要查看覆盖率时运行：

```bash
pnpm coverage:rust
```

HTML 报告写入 `target/llvm-cov/html/`。覆盖率用于定位缺少测试的路径，暂不设置全局通过门槛；
新增门槛前应先补齐当前低覆盖的字体工具和 CLI 编排代码，避免门槛只约束代码行数变化。

涉及部署产物时还要运行对应的 `pnpm build:*`。改动跨越多个工具或构建顺序时，运行完整构建：

```bash
pnpm build:all
```

最后检查代表性文件、manifest 和实际 URL，确认工具不只是“成功退出”，而是真的生成了正确结果。
