use std::path::Path;

fn main() {
    // Add rpath for vivid-c library
    #[cfg(target_os = "macos")]
    {
        // Priority 1: CI provides pre-built library via environment variable
        let lib_path = if let Ok(path) = std::env::var("VIVID_LIB_PATH") {
            println!("cargo:rerun-if-env-changed=VIVID_LIB_PATH");
            Some(path)
        }
        // Priority 2: Local vivid submodule build
        else {
            let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
            let vivid_lib_path = Path::new(&manifest_dir).join("../vivid/build/lib");
            if vivid_lib_path.exists() {
                vivid_lib_path.canonicalize().ok().map(|p| p.to_string_lossy().to_string())
            } else {
                None
            }
        };

        if let Some(path) = lib_path {
            println!("cargo:rustc-link-arg=-Wl,-rpath,{}", path);
        }
    }

    tauri_build::build()
}
