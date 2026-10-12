mod app;
mod cache;
mod config;
mod html;
mod images;
mod json;
mod stats;
mod thumbhash;
mod urls;

fn main() -> anyhow::Result<()> {
    app::run()
}
