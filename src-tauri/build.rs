use std::path::Path;

fn main() {
    // Add rpath for vivid-c library
    #[cfg(target_os = "macos")]
    {
        let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
        let vivid_lib_path = Path::new(&manifest_dir).join("../vivid/build/lib");
        if vivid_lib_path.exists() {
            let canonical_path = vivid_lib_path.canonicalize().unwrap();
            println!(
                "cargo:rustc-link-arg=-Wl,-rpath,{}",
                canonical_path.display()
            );
        }
    }

    tauri_build::build()
}
