use std::path::Path;

fn main() {
    let lib_path;

    // Priority 1: CI provides pre-built library via environment variable
    if let Ok(path) = std::env::var("VIVID_LIB_PATH") {
        lib_path = path;
        println!("cargo:rerun-if-env-changed=VIVID_LIB_PATH");
    }
    // Priority 2: Local vivid submodule build
    else if Path::new("../../vivid/build/lib").exists() {
        let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
        let path = Path::new(&manifest_dir).join("../../vivid/build/lib");
        lib_path = path.canonicalize().unwrap().to_string_lossy().to_string();
    }
    // Priority 3: System-installed vivid
    else {
        lib_path = "/usr/local/lib".to_string();
    }

    println!("cargo:rustc-link-search=native={}", lib_path);

    // Add rpath so the dylib can be found at runtime
    #[cfg(target_os = "macos")]
    println!("cargo:rustc-link-arg=-Wl,-rpath,{}", lib_path);

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
