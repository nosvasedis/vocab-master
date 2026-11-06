fn main() {
    // The pages are embedded in the release exe (src/assets.rs): rebuild when any of them changes.
    println!("cargo:rerun-if-changed=../renderer");
    println!("cargo:rerun-if-changed=shim");
    tauri_build::build()
}
