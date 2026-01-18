use std::path::Path;

fn main() {
    // Priority 1: CI provides pre-built library via environment variable
    if let Ok(lib_path) = std::env::var("VIVID_LIB_PATH") {
        println!("cargo:rustc-link-search=native={}", lib_path);
        println!("cargo:rerun-if-env-changed=VIVID_LIB_PATH");
    }
    // Priority 2: Local vivid submodule build
    else if Path::new("../../vivid/build/lib").exists() {
        let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
        let lib_path = Path::new(&manifest_dir).join("../../vivid/build/lib");
        println!("cargo:rustc-link-search=native={}", lib_path.display());
    }
    // Priority 3: System-installed vivid
    else {
        println!("cargo:rustc-link-search=native=/usr/local/lib");
    }

    // Link against vivid-c
    #[cfg(target_os = "macos")]
    println!("cargo:rustc-link-lib=dylib=vivid-c");

    #[cfg(target_os = "windows")]
    println!("cargo:rustc-link-lib=dylib=vivid-c");

    #[cfg(target_os = "linux")]
    println!("cargo:rustc-link-lib=dylib=vivid-c");

    // Include path for headers
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let include_path = Path::new(&manifest_dir).join("../../vivid/modules/vivid-core/include");
    println!("cargo:include={}", include_path.display());
}
