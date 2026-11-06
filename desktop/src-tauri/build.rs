fn main() {
    // The pages are embedded in the release exe (src/assets.rs): rebuild when any of them changes.
    println!("cargo:rerun-if-changed=../renderer");
    println!("cargo:rerun-if-changed=shim");
    // The app's version comes from desktop/package.json (tauri.conf.json): a version bump must rebuild the exe.
    println!("cargo:rerun-if-changed=../package.json");
    tauri_build::build()
}
