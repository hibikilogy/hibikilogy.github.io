use anyhow::{bail, Context, Result};
use pulldown_cmark::{Event, Parser, Tag};
use std::collections::BTreeMap;

pub fn rewrite_zola_links(
    markdown: &str,
    current_output: &str,
    routes: &BTreeMap<String, String>,
) -> Result<String> {
    let events = Parser::new(markdown).into_offset_iter().collect::<Vec<_>>();
    let protected = events
        .iter()
        .filter_map(|(event, range)| match event {
            Event::Start(Tag::CodeBlock(_)) | Event::Code(_) => Some(range.clone()),
            _ => None,
        })
        .collect::<Vec<_>>();
    let mut replacements = BTreeMap::new();

    for (start, _) in markdown.match_indices("@/") {
        if protected
            .iter()
            .any(|protected| protected.start <= start && start < protected.end)
            || markdown[..start].ends_with('\\')
        {
            continue;
        }
        let reference = &markdown[start + 2..];
        let Some((source_path, target_output)) = routes
            .iter()
            .filter(|(source_path, _)| {
                reference.starts_with(source_path.as_str())
                    && has_reference_boundary(&reference[source_path.len()..])
            })
            .max_by_key(|(source_path, _)| source_path.len())
        else {
            let unresolved = unresolved_reference(reference);
            if unresolved.ends_with(".md")
                && (unresolved.starts_with("articles/") || unresolved.starts_with("docs/"))
            {
                bail!(
                    "Markdown link {:?} in {current_output} does not target an exported page",
                    format!("@/{unresolved}")
                );
            }
            continue;
        };
        let end = start + 2 + source_path.len();
        replacements.insert(
            start,
            (
                end,
                relative_output_path(current_output, target_output)
                    .with_context(|| format!("failed to rewrite @/{source_path}"))?,
            ),
        );
    }

    let mut rewritten = markdown.to_owned();
    for (start, (end, replacement)) in replacements.into_iter().rev() {
        rewritten.replace_range(start..end, &replacement);
    }
    Ok(rewritten)
}

fn has_reference_boundary(suffix: &str) -> bool {
    suffix.is_empty()
        || suffix.chars().next().is_some_and(|character| {
            is_reference_delimiter(character) || matches!(character, '?' | '#')
        })
}

fn unresolved_reference(reference: &str) -> &str {
    let end = reference
        .char_indices()
        .find_map(|(index, character)| {
            (is_reference_delimiter(character) || matches!(character, '?' | '#')).then_some(index)
        })
        .unwrap_or(reference.len());
    &reference[..end]
}

fn is_reference_delimiter(character: char) -> bool {
    character.is_whitespace() || matches!(character, ')' | ']' | '}' | '>' | '"' | '\'' | '<')
}

fn relative_output_path(current: &str, target: &str) -> Result<String> {
    let current = path_components(current)?;
    let target = path_components(target)?;
    let current_parent = &current[..current.len() - 1];
    let shared = current_parent
        .iter()
        .zip(&target)
        .take_while(|(left, right)| left == right)
        .count();

    let mut relative = vec![".."; current_parent.len() - shared];
    relative.extend(target[shared..].iter().copied());
    if relative.is_empty() {
        bail!("cannot create a relative Markdown link from {current:?} to {target:?}");
    }
    Ok(relative.join("/"))
}

fn path_components(path: &str) -> Result<Vec<&str>> {
    let components = path.split('/').collect::<Vec<_>>();
    if components.is_empty()
        || components
            .iter()
            .any(|component| component.is_empty() || matches!(*component, "." | ".."))
    {
        bail!("invalid exported Markdown path: {path:?}");
    }
    Ok(components)
}
