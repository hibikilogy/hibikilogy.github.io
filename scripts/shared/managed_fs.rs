//! Guarded and atomic filesystem operations for generated artifacts.

use anyhow::{bail, Context, Result};
use std::fs;
use std::io::{ErrorKind, Write};
use std::path::{Component, Path, PathBuf};

pub fn ensure_directory(path: &Path) -> Result<()> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            bail!("refusing to use symlinked directory {}", path.display())
        }
        Ok(metadata) if !metadata.is_dir() => bail!("{} is not a directory", path.display()),
        Ok(_) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => {
            fs::create_dir_all(path).with_context(|| format!("failed to create {}", path.display()))
        }
        Err(error) => Err(error).with_context(|| format!("failed to inspect {}", path.display())),
    }
}

pub fn ensure_directory_beneath(root: &Path, path: &Path) -> Result<()> {
    let relative = path.strip_prefix(root).with_context(|| {
        format!(
            "managed directory {} is outside root {}",
            path.display(),
            root.display()
        )
    })?;
    ensure_directory(root)?;
    let mut current = root.to_path_buf();
    for component in relative.components() {
        let Component::Normal(part) = component else {
            bail!("invalid managed directory path {}", path.display());
        };
        current.push(part);
        ensure_directory(&current)?;
    }
    Ok(())
}

pub fn reject_symlink_or_directory(path: &Path) -> Result<()> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            bail!("refusing to overwrite symlink {}", path.display())
        }
        Ok(metadata) if metadata.is_dir() => bail!("{} is a directory", path.display()),
        Ok(_) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error).with_context(|| format!("failed to inspect {}", path.display())),
    }
}

pub fn atomic_sidecar_path(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_os_string();
    name.push(format!(".{suffix}"));
    PathBuf::from(name)
}

pub fn recover_atomic_file(path: &Path) -> Result<()> {
    let backup = atomic_sidecar_path(path, "bak");
    if !path.exists() && backup.exists() {
        reject_symlink_or_directory(&backup)?;
        fs::rename(&backup, path).with_context(|| {
            format!(
                "failed to recover {} from {}",
                path.display(),
                backup.display()
            )
        })?;
    }
    Ok(())
}

/// Like [`write_atomic`], but skips the write entirely when the destination
/// already holds identical contents. Returns whether a write happened, so
/// callers can avoid mtime churn for unchanged generated artifacts.
pub fn write_atomic_if_changed(path: &Path, contents: &[u8]) -> Result<bool> {
    match fs::read(path) {
        Ok(existing) if existing == contents => return Ok(false),
        Ok(_) => {}
        Err(error) if error.kind() == ErrorKind::NotFound => {}
        Err(error) => {
            return Err(error).with_context(|| format!("failed to inspect {}", path.display()));
        }
    }
    write_atomic(path, contents)?;
    Ok(true)
}

pub fn write_atomic(path: &Path, contents: &[u8]) -> Result<()> {
    if let Some(parent) = path.parent() {
        ensure_directory(parent)?;
    }
    let temporary = atomic_sidecar_path(path, "tmp");
    let backup = atomic_sidecar_path(path, "bak");
    reject_symlink_or_directory(path)?;
    reject_symlink_or_directory(&temporary)?;
    reject_symlink_or_directory(&backup)?;

    let mut file = fs::File::create(&temporary)
        .with_context(|| format!("failed to create {}", temporary.display()))?;
    file.write_all(contents)
        .with_context(|| format!("failed to write {}", temporary.display()))?;
    file.sync_all()
        .with_context(|| format!("failed to sync {}", temporary.display()))?;
    drop(file);

    if backup.exists() {
        fs::remove_file(&backup)
            .with_context(|| format!("failed to remove stale {}", backup.display()))?;
    }
    if path.exists() {
        fs::rename(path, &backup).with_context(|| {
            format!(
                "failed to move {} to recovery file {}",
                path.display(),
                backup.display()
            )
        })?;
    }
    if let Err(error) = fs::rename(&temporary, path) {
        if !path.exists() && backup.exists() {
            let _ = fs::rename(&backup, path);
        }
        return Err(error).with_context(|| format!("failed to replace {}", path.display()));
    }
    if backup.exists() {
        fs::remove_file(&backup)
            .with_context(|| format!("failed to remove {}", backup.display()))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{ensure_directory_beneath, write_atomic_if_changed};
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_path(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "hibikilogy-managed-{}-{}",
            name,
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn write_atomic_if_changed_writes_when_absent_or_different() {
        let path = unique_path("absent");
        assert!(write_atomic_if_changed(&path, b"one").unwrap());
        assert_eq!(fs::read(&path).unwrap(), b"one");

        assert!(write_atomic_if_changed(&path, b"two").unwrap());
        assert_eq!(fs::read(&path).unwrap(), b"two");

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn write_atomic_if_changed_skips_identical_contents() {
        let path = unique_path("identical");
        write_atomic_if_changed(&path, b"same").unwrap();
        let original_modified = fs::metadata(&path).unwrap().modified().unwrap();

        assert!(!write_atomic_if_changed(&path, b"same").unwrap());
        assert_eq!(fs::read(&path).unwrap(), b"same");
        assert_eq!(
            fs::metadata(&path).unwrap().modified().unwrap(),
            original_modified
        );

        let _ = fs::remove_file(&path);
    }

    #[test]
    fn rejects_managed_directory_outside_root() {
        let root =
            std::env::temp_dir().join(format!("hibikilogy-managed-root-{}", std::process::id()));
        assert!(ensure_directory_beneath(&root, &root.join("../escape")).is_err());
        let _ = std::fs::remove_dir_all(root);
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlinked_ancestor() {
        use std::fs;
        use std::os::unix::fs::symlink;
        use std::time::{SystemTime, UNIX_EPOCH};
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("hibikilogy-managed-{unique}"));
        let target = std::env::temp_dir().join(format!("hibikilogy-target-{unique}"));
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&target).unwrap();
        symlink(&target, root.join("linked")).unwrap();
        assert!(ensure_directory_beneath(&root, &root.join("linked/nested")).is_err());
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&target);
    }
}
