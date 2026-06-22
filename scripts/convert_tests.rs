use super::{replace_url_with_count, resolve_host_rewrite_config, rewrite_image_tags_in_directory, Args};
use image::{ImageBuffer, Rgba};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

#[test]
fn resolves_hosts_from_zola_config_and_allows_cli_override() {
    let fixture = TestFixture::new("host-config");
    fixture.write_bytes(
        "config.toml",
        br#"
[extra.image_host_rewrite]
old_host = "https://old.example.com/"
new_host = "https://cdn.example.com/"
"#,
    );

    let configured = resolve_host_rewrite_config(&Args {
        config: fixture.root.join("config.toml"),
        directory: fixture.public_dir.clone(),
        old_host: None,
        new_host: None,
        cache_dir: fixture.root.join("cache"),
    })
    .unwrap();
    assert_eq!(configured.old_host, "https://old.example.com/");
    assert_eq!(configured.new_host, "https://cdn.example.com/");

    let overridden = resolve_host_rewrite_config(&Args {
        config: fixture.root.join("config.toml"),
        directory: fixture.public_dir.clone(),
        old_host: Some("https://override-old.example.com/".to_string()),
        new_host: Some("https://override-cdn.example.com/".to_string()),
        cache_dir: fixture.root.join("cache"),
    })
    .unwrap();
    assert_eq!(overridden.old_host, "https://override-old.example.com/");
    assert_eq!(overridden.new_host, "https://override-cdn.example.com/");
}

#[test]
fn rewrites_lazy_image_urls_and_injects_missing_metadata() {
    let fixture = TestFixture::new("injects-metadata");
    fixture.write_png("public/imgs/example.png", 4, 3);
    fixture.write_html(
        "public/index.html",
        r#"<lazy-image src="/imgs/example.png" alt="cover"></lazy-image>"#,
    );

    let stats = rewrite_image_tags_in_directory(
        fixture.public_dir.as_path(),
        "https://old.example.com",
        "https://cdn.example.com",
        fixture.cache_file.as_path(),
    )
    .unwrap();

    let html = fixture.read_html("public/index.html");
    assert!(html.contains(r#"src="https://cdn.example.com/imgs/example.png""#));
    assert!(html.contains(r#"width="4""#));
    assert!(html.contains(r#"height="3""#));
    assert!(html.contains(r#"thumbhash=""#));
    assert_eq!(stats.metadata_injected, 3);
    assert_eq!(stats.cache_misses, 1);
}

#[test]
fn handles_unquoted_absolute_lazy_image_src() {
    let fixture = TestFixture::new("unquoted-absolute-src");
    fixture.write_png("public/imgs/example.png", 6, 5);
    fixture.write_html(
        "public/index.html",
        r#"<lazy-image src=https://old.example.com/imgs/example.png alt=cover></lazy-image>"#,
    );

    let stats = rewrite_image_tags_in_directory(
        fixture.public_dir.as_path(),
        "https://old.example.com/",
        "https://cdn.example.com/",
        fixture.cache_file.as_path(),
    )
    .unwrap();

    let html = fixture.read_html("public/index.html");
    assert!(html.contains(r#"src="https://cdn.example.com/imgs/example.png""#));
    assert!(!html.contains(r#"src="https:""#));
    assert!(!html.contains(r#"old.example.com=""#));
    assert!(html.contains(r#"width="6""#));
    assert!(html.contains(r#"height="5""#));
    assert!(html.contains(r#"thumbhash=""#));
    assert_eq!(stats.urls_rewritten, 1);
    assert_eq!(stats.metadata_injected, 3);
}

#[test]
fn reuses_cache_for_second_file() {
    let fixture = TestFixture::new("cache-hit");
    fixture.write_png("public/imgs/example.png", 5, 4);
    fixture.write_html(
        "public/first.html",
        r#"<lazy-image src="/imgs/example.png"></lazy-image>"#,
    );

    rewrite_image_tags_in_directory(
        fixture.public_dir.as_path(),
        "https://old.example.com",
        "https://cdn.example.com",
        fixture.cache_file.as_path(),
    )
    .unwrap();

    fixture.write_html(
        "public/second.html",
        r#"<lazy-image src="/imgs/example.png"></lazy-image>"#,
    );

    let stats = rewrite_image_tags_in_directory(
        fixture.public_dir.as_path(),
        "https://old.example.com",
        "https://cdn.example.com",
        fixture.cache_file.as_path(),
    )
    .unwrap();

    assert_eq!(stats.cache_hits, 1);
    assert_eq!(stats.cache_misses, 0);
}

#[test]
fn skips_unchanged_html_files_after_processing() {
    let fixture = TestFixture::new("html-skip-cache");
    fixture.write_png("public/imgs/example.png", 5, 4);
    fixture.write_html(
        "public/index.html",
        r#"<div class="content-container"><img src="/imgs/example.png"></div>"#,
    );

    rewrite_image_tags_in_directory(
        fixture.public_dir.as_path(),
        "https://old.example.com",
        "https://cdn.example.com",
        fixture.cache_file.as_path(),
    )
    .unwrap();

    let stats = rewrite_image_tags_in_directory(
        fixture.public_dir.as_path(),
        "https://old.example.com",
        "https://cdn.example.com",
        fixture.cache_file.as_path(),
    )
    .unwrap();

    assert_eq!(stats.files_skipped, 1);
    assert_eq!(stats.files_changed, 0);
    assert_eq!(stats.urls_rewritten, 0);
    assert_eq!(stats.metadata_injected, 0);
    assert_eq!(stats.cache_hits, 0);
    assert_eq!(stats.cache_misses, 0);
}

#[test]
fn preserves_existing_metadata_fields() {
    let fixture = TestFixture::new("preserve-existing");
    fixture.write_png("public/imgs/example.png", 4, 3);
    fixture.write_html(
            "public/index.html",
            r#"<lazy-image src="/imgs/example.png" width="10" height="11" thumbhash="abc"></lazy-image>"#,
        );

    let stats = rewrite_image_tags_in_directory(
        fixture.public_dir.as_path(),
        "https://old.example.com",
        "https://cdn.example.com",
        fixture.cache_file.as_path(),
    )
    .unwrap();

    let html = fixture.read_html("public/index.html");
    assert!(html.contains(r#"width="10""#));
    assert!(html.contains(r#"height="11""#));
    assert!(html.contains(r#"thumbhash="abc""#));
    assert_eq!(stats.metadata_injected, 0);
}

#[test]
fn rewrites_img_urls_without_injecting_metadata() {
    let fixture = TestFixture::new("img-url-only");
    fixture.write_png("public/imgs/example.png", 7, 6);
    fixture.write_html(
            "public/index.html",
            r#"<img src=https://old.example.com/imgs/example.png srcset="/imgs/example.png 1x, ./imgs/example.png 2x" data-srcset="../imgs/example.png 3x">"#,
        );

    let stats = rewrite_image_tags_in_directory(
        fixture.public_dir.as_path(),
        "https://old.example.com/",
        "https://cdn.example.com/",
        fixture.cache_file.as_path(),
    )
    .unwrap();

    let html = fixture.read_html("public/index.html");
    assert!(html.contains(r#"src="https://cdn.example.com/imgs/example.png""#));
    assert!(html.contains(
            r#"srcset="https://cdn.example.com/imgs/example.png 1x, https://cdn.example.com/imgs/example.png 2x""#
        ));
    assert!(html.contains(r#"data-srcset="https://cdn.example.com/imgs/example.png 3x""#));
    assert!(!html.contains("thumbhash="));
    assert!(!html.contains("width="));
    assert!(!html.contains("height="));
    assert_eq!(stats.urls_rewritten, 4);
    assert_eq!(stats.metadata_injected, 0);
    assert_eq!(stats.cache_hits, 0);
    assert_eq!(stats.cache_misses, 0);
}

#[test]
fn converts_local_img_inside_content_container_to_lazy_image() {
    let fixture = TestFixture::new("content-container-img");
    fixture.write_png("public/imgs/example.png", 9, 8);
    fixture.write_html(
            "public/index.html",
            r#"<main><div class="content-container"><p><img src="/imgs/example.png" alt="cover"></p></div></main>"#,
        );

    let stats = rewrite_image_tags_in_directory(
        fixture.public_dir.as_path(),
        "https://old.example.com/",
        "https://cdn.example.com/",
        fixture.cache_file.as_path(),
    )
    .unwrap();

    let html = fixture.read_html("public/index.html");
    assert!(html.contains(
            r#"<lazy-image src="https://cdn.example.com/imgs/example.png" alt="cover" zoomable="true" thumbhash=""#
    ));
    assert!(html.contains(r#"width="9""#));
    assert!(html.contains(r#"height="8""#));
    assert!(html.contains(r#"></lazy-image>"#));
    assert!(!html.contains("<img"));
    assert_eq!(stats.urls_rewritten, 1);
    assert_eq!(stats.metadata_injected, 3);
    assert_eq!(stats.cache_misses, 1);
}

#[test]
fn leaves_external_img_inside_content_container_as_img() {
    let fixture = TestFixture::new("content-container-external-img");
    fixture.write_html(
            "public/index.html",
            r#"<div class="content-container"><img src="https://other.example.com/image.png" alt="external"></div>"#,
        );

    let stats = rewrite_image_tags_in_directory(
        fixture.public_dir.as_path(),
        "https://old.example.com/",
        "https://cdn.example.com/",
        fixture.cache_file.as_path(),
    )
    .unwrap();

    let html = fixture.read_html("public/index.html");
    assert!(html.contains(r#"<img src="https://other.example.com/image.png" alt="external">"#));
    assert!(!html.contains("<lazy-image"));
    assert_eq!(stats.urls_rewritten, 0);
    assert_eq!(stats.metadata_injected, 0);
    assert_eq!(stats.cache_misses, 0);
}

#[test]
fn unsupported_local_image_rewrites_url_without_converting_img() {
    let fixture = TestFixture::new("unsupported-local-image");
    fixture.write_bytes("public/imgs/not-really.webp", b"not a supported image");
    fixture.write_html(
        "public/index.html",
        r#"<div class="content-container"><img src="/imgs/not-really.webp" alt="bad"></div>"#,
    );

    let stats = rewrite_image_tags_in_directory(
        fixture.public_dir.as_path(),
        "https://old.example.com/",
        "https://cdn.example.com/",
        fixture.cache_file.as_path(),
    )
    .unwrap();

    let html = fixture.read_html("public/index.html");
    assert!(html.contains(r#"<img src="https://cdn.example.com/imgs/not-really.webp" alt="bad">"#));
    assert!(!html.contains("<lazy-image"));
    assert!(!html.contains("thumbhash="));
    assert_eq!(stats.urls_rewritten, 1);
    assert_eq!(stats.metadata_injected, 0);
    assert_eq!(stats.metadata_skipped, 1);
    assert_eq!(stats.cache_misses, 1);
}

#[test]
fn ignores_raw_text_content_and_rewrites_later_images() {
    let fixture = TestFixture::new("raw-text-before-images");
    fixture.write_png("public/imgs/example.png", 11, 10);
    let style = r#"<style>.icon{--icon:url("data:image/svg+xml,<svg viewBox='0 0 1 1'><path d='M0 0'/></svg>")}@media (width<=719px){.x{display:none}}</style>"#;
    fixture.write_html(
            "public/index.html",
            &format!(
                r#"{style}<main><div class="content-container"><img src="/imgs/example.png" alt="inside"></div><img src="/imgs/example.png" alt="outside"></main>"#
            ),
        );

    let stats = rewrite_image_tags_in_directory(
        fixture.public_dir.as_path(),
        "https://old.example.com/",
        "https://cdn.example.com/",
        fixture.cache_file.as_path(),
    )
    .unwrap();

    let html = fixture.read_html("public/index.html");
    assert!(html.starts_with(style));
    assert!(html.contains(
        r#"<lazy-image src="https://cdn.example.com/imgs/example.png" alt="inside" zoomable="true" thumbhash=""#
    ));
    assert!(html.contains(r#"width="11""#));
    assert!(html.contains(r#"height="10""#));
    assert!(html.contains(r#"<img src="https://cdn.example.com/imgs/example.png" alt="outside">"#));
    assert_eq!(stats.urls_rewritten, 2);
    assert_eq!(stats.metadata_injected, 3);
    assert_eq!(stats.cache_misses, 1);
}

#[test]
fn stray_quote_in_non_image_tag_does_not_swallow_later_images() {
    let fixture = TestFixture::new("stray-quote-before-image");
    fixture.write_png("public/imgs/example.png", 13, 12);
    fixture.write_html(
            "public/index.html",
            r#"<link ' href=/logo-blue.svg rel=icon><div class="content-container"><img src="/imgs/example.png"></div>"#,
        );

    let stats = rewrite_image_tags_in_directory(
        fixture.public_dir.as_path(),
        "https://old.example.com/",
        "https://cdn.example.com/",
        fixture.cache_file.as_path(),
    )
    .unwrap();

    let html = fixture.read_html("public/index.html");
    assert!(html.contains(r#"<link ' href=/logo-blue.svg rel=icon>"#));
    assert!(
        html.contains(r#"<lazy-image src="https://cdn.example.com/imgs/example.png" zoomable="true" thumbhash=""#)
    );
    assert!(html.contains(r#"width="13""#));
    assert!(html.contains(r#"height="12""#));
    assert_eq!(stats.urls_rewritten, 1);
    assert_eq!(stats.metadata_injected, 3);
}

#[test]
fn percent_encoded_local_image_path_can_inject_metadata() {
    let fixture = TestFixture::new("percent-encoded-local-image");
    fixture.write_png("public/imgs/example image.png", 15, 14);
    fixture.write_html(
        "public/index.html",
        r#"<div class="content-container"><img src="/imgs/example%20image.png"></div>"#,
    );

    let stats = rewrite_image_tags_in_directory(
        fixture.public_dir.as_path(),
        "https://old.example.com/",
        "https://cdn.example.com/",
        fixture.cache_file.as_path(),
    )
    .unwrap();

    let html = fixture.read_html("public/index.html");
    assert!(html.contains(
        r#"<lazy-image src="https://cdn.example.com/imgs/example%20image.png" zoomable="true" thumbhash=""#
    ));
    assert!(html.contains(r#"width="15""#));
    assert!(html.contains(r#"height="14""#));
    assert_eq!(stats.urls_rewritten, 1);
    assert_eq!(stats.metadata_injected, 3);
    assert_eq!(stats.cache_misses, 1);
}

#[test]
fn replace_url_matches_python_behavior() {
    assert_eq!(
        replace_url_with_count(
            "https://old.example.com/img/a.png",
            "https://old.example.com",
            "https://cdn.example.com"
        )
        .0,
        "https://cdn.example.com/img/a.png"
    );
    assert_eq!(
        replace_url_with_count(
            "/img/a.png",
            "https://old.example.com",
            "https://cdn.example.com"
        )
        .0,
        "https://cdn.example.com/img/a.png"
    );
    assert_eq!(
        replace_url_with_count(
            "cover.png",
            "https://old.example.com",
            "https://cdn.example.com"
        )
        .0,
        "https://cdn.example.com/cover.png"
    );
    assert_eq!(
        replace_url_with_count(
            "./img/a.png",
            "https://old.example.com",
            "https://cdn.example.com"
        )
        .0,
        "https://cdn.example.com/img/a.png"
    );
    assert_eq!(
        replace_url_with_count(
            "../img/a.png",
            "https://old.example.com",
            "https://cdn.example.com"
        )
        .0,
        "https://cdn.example.com/img/a.png"
    );
}

#[test]
fn does_not_rewrite_svg_or_gif_urls() {
    assert_eq!(
        replace_url_with_count(
            "https://old.example.com/a.svg",
            "https://old.example.com",
            "https://cdn.example.com"
        )
        .0,
        "https://old.example.com/a.svg"
    );
    assert_eq!(
        replace_url_with_count(
            "/b.gif",
            "https://old.example.com",
            "https://cdn.example.com"
        )
        .0,
        "/b.gif"
    );
}

struct TestFixture {
    root: PathBuf,
    public_dir: PathBuf,
    cache_file: PathBuf,
}

impl TestFixture {
    fn new(name: &str) -> Self {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("hibikilogy-convert-{name}-{unique}"));
        let public_dir = root.join("public");
        fs::create_dir_all(&public_dir).unwrap();
        let cache_file = root.join("cache").join("lazy-image-metadata.json");
        Self {
            root,
            public_dir,
            cache_file,
        }
    }

    fn write_html(&self, relative_path: &str, html: &str) {
        let path = self.root.join(relative_path);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, html).unwrap();
    }

    fn read_html(&self, relative_path: &str) -> String {
        fs::read_to_string(self.root.join(relative_path)).unwrap()
    }

    fn write_png(&self, relative_path: &str, width: u32, height: u32) {
        let path = self.root.join(relative_path);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        let image = ImageBuffer::from_fn(width, height, |x, y| {
            Rgba([(x * 20) as u8, (y * 30) as u8, 200, 255])
        });
        image.save(path).unwrap();
    }

    fn write_bytes(&self, relative_path: &str, bytes: &[u8]) {
        let path = self.root.join(relative_path);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).unwrap();
        }
        fs::write(path, bytes).unwrap();
    }
}

impl Drop for TestFixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}
