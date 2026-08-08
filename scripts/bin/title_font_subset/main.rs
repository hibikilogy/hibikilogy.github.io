mod app;
mod codepoints;
mod markdown;

fn main() -> anyhow::Result<()> {
    app::run()
}
