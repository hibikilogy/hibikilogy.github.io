use std::process::Command;

const BINARIES: &[&str] = &[
    env!("CARGO_BIN_EXE_article-short-links"),
    env!("CARGO_BIN_EXE_deploy-markdown"),
    env!("CARGO_BIN_EXE_site-artifact-rewrite"),
    env!("CARGO_BIN_EXE_title-font-subset"),
    env!("CARGO_BIN_EXE_body-font-subset"),
];

#[test]
fn every_rust_tool_exposes_help() {
    for executable in BINARIES {
        let output = Command::new(executable).arg("--help").output().unwrap();
        assert!(
            output.status.success(),
            "{} --help failed: {}",
            executable,
            String::from_utf8_lossy(&output.stderr)
        );
        assert!(
            String::from_utf8_lossy(&output.stdout).contains("Usage:"),
            "{} --help printed no usage text",
            executable
        );
        assert!(
            output.stderr.is_empty(),
            "{} --help wrote to stderr: {}",
            executable,
            String::from_utf8_lossy(&output.stderr)
        );
    }
}

#[test]
fn every_rust_tool_fails_on_unknown_args() {
    // `deploy-markdown` has defaults for every argument, so a bare invocation
    // is valid; unknown flags are rejected uniformly by clap for all tools.
    for executable in BINARIES {
        let output = Command::new(executable)
            .arg("--definitely-not-a-real-flag")
            .output()
            .unwrap();
        assert!(
            !output.status.success(),
            "{} should reject unknown flags",
            executable
        );
    }
}
