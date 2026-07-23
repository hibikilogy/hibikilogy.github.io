//! URL path and query encoding rules shared by deployment tools.

use percent_encoding::{percent_decode_str, utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};

const UNRESERVED: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'_')
    .remove(b'.')
    .remove(b'~');
const PATH: &AsciiSet = &UNRESERVED.remove(b'/');

pub fn encode_query_value(value: &str) -> String {
    utf8_percent_encode(value, UNRESERVED).to_string()
}

pub fn encode_path(value: &str) -> String {
    utf8_percent_encode(value, PATH).to_string()
}

pub fn decode_path(value: &str) -> Option<String> {
    percent_decode_str(value)
        .decode_utf8()
        .ok()
        .map(|value| value.into_owned())
}

#[cfg(test)]
mod tests {
    use super::{decode_path, encode_path, encode_query_value};

    #[test]
    fn preserves_only_the_expected_url_characters() {
        assert_eq!(encode_query_value("/s/2026-ab/"), "%2Fs%2F2026-ab%2F");
        assert_eq!(
            encode_path("content/docs/你好 world.md"),
            "content/docs/%E4%BD%A0%E5%A5%BD%20world.md"
        );
        assert_eq!(
            decode_path("imgs/%E4%BD%A0%E5%A5%BD%20world.png").as_deref(),
            Some("imgs/你好 world.png")
        );
    }
}
