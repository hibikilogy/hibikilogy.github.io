use std::process::Command;

#[test]
fn every_rust_tool_exposes_help() {
    for executable in [
        env!("CARGO_BIN_EXE_article-short-links"),
        env!("CARGO_BIN_EXE_deploy-markdown"),
        env!("CARGO_BIN_EXE_html-img-host-rewrite"),
        env!("CARGO_BIN_EXE_title-font-subset"),
        env!("CARGO_BIN_EXE_body-font-subset"),
    ] {
        let output = Command::new(executable).arg("--help").output().unwrap();
        assert!(
            output.status.success(),
            "{} --help failed: {}",
            executable,
            String::from_utf8_lossy(&output.stderr)
        );
        assert!(String::from_utf8_lossy(&output.stdout).contains("Usage:"));
    }
}
