//! The installed pages (desktop/renderer). The release exe carries them inside itself; a debug build reads
//! them from the folder, so page edits show on reload without rebuilding.
use rust_embed::Embed;
use std::borrow::Cow;

#[derive(Embed)]
#[folder = "../renderer/"]
#[exclude = "*.DS_Store"]
#[exclude = "Thumbs.db"]
struct Pages;

/// A page file by its path inside the pages ("js/main.js").
pub fn get(rel: &str) -> Option<Cow<'static, [u8]>> {
    Pages::get(rel).map(|f| f.data)
}

pub fn exists(rel: &str) -> bool {
    Pages::get(rel).is_some()
}
