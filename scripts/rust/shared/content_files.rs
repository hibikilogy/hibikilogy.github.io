//! Stable discovery of Markdown content files.

use anyhow::{Context, Result};
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};

pub fn sorted_markdown_files(directory: &Path, skip_index: bool) -> Result<Vec<PathBuf>> {
    let mut files = Vec::new();
    for entry in fs::read_dir(directory)
        .with_context(|| format!("failed to read {}", directory.display()))?
    {
        let entry = entry.with_context(|| format!("failed to read {}", directory.display()))?;
        let path = entry.path();
        let file_type = entry
            .file_type()
            .with_context(|| format!("failed to inspect {}", path.display()))?;
        if file_type.is_symlink() && path.extension().and_then(OsStr::to_str) == Some("md") {
            anyhow::bail!("Markdown symlinks are not supported: {}", path.display());
        }
        if !file_type.is_file()
            || path.extension().and_then(OsStr::to_str) != Some("md")
            || (skip_index && path.file_name().and_then(OsStr::to_str) == Some("_index.md"))
        {
            continue;
        }
        files.push(path);
    }
    files.sort();
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::sorted_markdown_files;
    use std::fs;

    #[test]
    fn returns_sorted_markdown_files_and_skips_index() {
        let root =
            std::env::temp_dir().join(format!("hibikilogy-content-files-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("b.md"), "").unwrap();
        fs::write(root.join("a.md"), "").unwrap();
        fs::write(root.join("_index.md"), "").unwrap();
        fs::write(root.join("note.txt"), "").unwrap();

        let names = sorted_markdown_files(&root, true)
            .unwrap()
            .into_iter()
            .map(|path| path.file_name().unwrap().to_string_lossy().into_owned())
            .collect::<Vec<_>>();
        assert_eq!(names, ["a.md", "b.md"]);
        fs::remove_dir_all(root).unwrap();
    }
}
