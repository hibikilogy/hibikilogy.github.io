pub(super) fn join_url(host: &str, path: &str) -> String {
    format!(
        "{}/{}",
        host.trim_end_matches('/'),
        path.trim_start_matches('/')
    )
}

pub(super) fn replace_url_with_count(url: &str, old_host: &str, new_host: &str) -> (String, usize) {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return (url.to_string(), 0);
    }

    let leading_len = url.len() - url.trim_start().len();
    let trailing_len = url.len() - url.trim_end().len();
    let leading = &url[..leading_len];
    let trailing = &url[url.len() - trailing_len..];

    if should_skip_url(trimmed) {
        return (url.to_string(), 0);
    }

    let old_host = old_host.trim_end_matches('/');
    let new_host = new_host.trim_end_matches('/');
    let relative_path = strip_relative_prefix(trimmed);

    let rewritten = if let Some(suffix) = trimmed.strip_prefix(old_host) {
        join_url(new_host, suffix)
    } else if trimmed.starts_with('/') || is_rewriteable_relative_url(trimmed) {
        join_url(new_host, relative_path)
    } else {
        trimmed.to_string()
    };

    if rewritten == trimmed {
        return (url.to_string(), 0);
    }

    (format!("{leading}{rewritten}{trailing}"), 1)
}

pub(super) fn rewrite_attribute_value(
    attr_name: &str,
    value: &str,
    old_host: &str,
    new_host: &str,
) -> (String, usize) {
    if attr_name.ends_with("srcset") {
        rewrite_srcset_value(value, old_host, new_host)
    } else {
        replace_url_with_count(value, old_host, new_host)
    }
}

pub(super) fn rewrite_srcset_value(value: &str, old_host: &str, new_host: &str) -> (String, usize) {
    let mut rewritten = Vec::new();
    let mut rewritten_urls = 0;

    for candidate in value.split(',') {
        let (rewritten_candidate, candidate_rewrites) =
            rewrite_srcset_candidate(candidate, old_host, new_host);
        rewritten.push(rewritten_candidate);
        rewritten_urls += candidate_rewrites;
    }

    if rewritten_urls == 0 {
        return (value.to_string(), 0);
    }

    (rewritten.join(","), rewritten_urls)
}

pub(super) fn rewrite_srcset_candidate(
    candidate: &str,
    old_host: &str,
    new_host: &str,
) -> (String, usize) {
    let trimmed = candidate.trim();
    if trimmed.is_empty() {
        return (candidate.to_string(), 0);
    }

    let leading_len = candidate.len() - candidate.trim_start().len();
    let trailing_len = candidate.len() - candidate.trim_end().len();
    let leading = &candidate[..leading_len];
    let trailing = &candidate[candidate.len() - trailing_len..];
    let url_end = trimmed.find(char::is_whitespace).unwrap_or(trimmed.len());
    let url = &trimmed[..url_end];
    let descriptor = &trimmed[url_end..];
    let (rewritten_url, rewritten_count) = replace_url_with_count(url, old_host, new_host);

    if rewritten_count == 0 {
        return (candidate.to_string(), 0);
    }

    (
        format!("{leading}{rewritten_url}{descriptor}{trailing}"),
        rewritten_count,
    )
}

pub(super) fn is_rewriteable_relative_url(url: &str) -> bool {
    !url.starts_with("//") && !url.starts_with('#') && !url.starts_with('?') && !has_scheme(url)
}

pub(super) fn has_scheme(url: &str) -> bool {
    let Some(index) = url.find(':') else {
        return false;
    };

    index > 0
        && url[..index]
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '+' | '-' | '.'))
}

pub(super) fn strip_relative_prefix(path: &str) -> &str {
    let mut normalized = path;

    while let Some(stripped) = normalized.strip_prefix("./") {
        normalized = stripped;
    }

    while let Some(stripped) = normalized.strip_prefix("../") {
        normalized = stripped;
    }

    normalized
}

pub(super) fn should_skip_url(url: &str) -> bool {
    let path = url.split(['?', '#']).next().unwrap_or(url);
    let lower = path.to_ascii_lowercase();
    lower.ends_with(".svg") || lower.ends_with(".gif")
}
